import ts from 'typescript';

/**
 * Is this change nothing but words?
 *
 * The twice-daily client-feedback job may merge its own work to `main` without
 * a human, but only for changes that alter what a reader *sees* and nothing
 * about what the program *does*. "Copy-only" has to be a mechanical fact, not
 * a judgement the job makes about its own diff, because a model grading its
 * own homework is exactly the failure this guard exists to prevent.
 *
 * So: strip every string literal, template chunk and JSX text from both sides
 * and compare what is left, token by token. If the remaining token stream —
 * every identifier, keyword, operator, bracket and number — is byte-identical,
 * then the only thing that changed is text a person reads. If anything else
 * moved, it is code, and it goes to a pull request for a human.
 *
 * Two things this deliberately does NOT do:
 *
 *   * It does not look at how large the diff is. Fixing forty typos is still
 *     forty typos.
 *   * It does not trust itself as the only gate. `PROTECTED_PATHS` below holds
 *     the files where a string literal *is* the behaviour — a route prefix in
 *     `proxy.ts`, a directive in `csp.ts`, a bucket name in an API route — and
 *     those are never copy-only no matter how the tokens compare. CI passing
 *     is a further, separate gate on top of both.
 */

/**
 * Files where changing a string changes what the program does, so the token
 * comparison below would give the wrong answer. Matched as path prefixes and
 * as globs on the extension.
 */
export const PROTECTED_PATHS: readonly string[] = [
  // A string here is a route that skips authentication.
  'src/proxy.ts',
  // A string here is a Content-Security-Policy directive.
  'src/lib/csp.ts',
  // The output encoders. Every one of their literals is a security decision.
  'src/lib/security.ts',
  // Database access, schema types, and anything that reaches the service role.
  'src/lib/supabase/',
  'supabase/',
  // Route handlers: a literal can be a bucket, a header, a redirect target.
  'src/app/api/',
  // The build, the test harness, and the pipeline that gates all of this.
  '.github/',
  'scripts/',
  'package.json',
  'package-lock.json',
  'next.config.ts',
  'next.config.js',
  'next.config.mjs',
  'tsconfig.json',
  'vitest.config.ts',
  'playwright.config.ts',
  'eslint.config.mjs',
  'eslint.config.js',
  // The guard may not widen itself.
  'src/lib/copy-only.ts',
];

/** Extensions whose entire contents are prose. */
const PROSE_EXTENSIONS = new Set(['md', 'markdown', 'txt']);
/** Extensions we can tokenize as JavaScript/TypeScript. */
const CODE_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs']);

export interface CopyOnlyVerdict {
  copyOnly: boolean;
  /** Why not, in a sentence a person can act on. Empty when `copyOnly`. */
  reason: string;
}

const YES: CopyOnlyVerdict = { copyOnly: true, reason: '' };
const no = (reason: string): CopyOnlyVerdict => ({ copyOnly: false, reason });

function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot === -1 ? '' : base.slice(dot + 1).toLowerCase();
}

export function isProtectedPath(path: string): boolean {
  const normalized = path.replace(/^\.\//, '');
  if (PROTECTED_PATHS.some((p) => normalized === p || normalized.startsWith(p))) {
    return true;
  }
  // Any SQL, lockfile, env file or CI config anywhere in the tree.
  return /\.(sql|lock|ya?ml|toml)$/i.test(normalized) || /(^|\/)\.env/.test(normalized);
}

/**
 * A literal that is a destination rather than a sentence.
 *
 * This is the hole that makes a naive comparison dangerous. In TSX a string
 * literal can be an `href`, a `src`, a redirect target or a fetch URL, and
 * swapping one reads as "only a string" while completely changing where a
 * person ends up. It matters more here than in most codebases, because the
 * feedback this job acts on arrives from anyone holding the checklist link:
 * "the sign-in button should point at ..." is a sentence a stranger can type
 * into the box.
 *
 * So a literal that looks like a locator on EITHER side of the change stops the
 * auto-merge and a human reads it. Words stay words.
 */
function looksLikeLocator(text: string): boolean {
  return (
    text.includes('://') ||
    /^\s*\.{0,2}\//.test(text) ||
    /\b(?:javascript|data|mailto|tel|file|blob|vbscript)\s*:/i.test(text) ||
    /\b[\w-]+\.(?:com|net|org|io|me|app|co|dev|sh|ai|xyz|link|gg)\b/i.test(text) ||
    // Markup inside a literal. Every path escapes before it reaches the DOM,
    // but a tag appearing in copy is not a copy change.
    /<[a-z/!]/i.test(text)
  );
}

/**
 * A literal that is a machine key rather than something a person reads.
 *
 * Storage keys, data attributes, query params, feature slugs and status strings
 * are all "just strings" to a parser, and changing one is never a copy edit —
 * it silently repoints the program at different state. The checklist's own
 * `swb-scope-v4` is the cautionary case: renaming it to `swb-scope-v5` shipped
 * once and hid the progress of the one person walking the list, with no error
 * anywhere.
 *
 * Prose has spaces in it. A single plain word ("Save" becoming "Send") is still
 * copy. A single token carrying separators or capitalisation patterns is a key.
 */
function looksLikeKey(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  if (/\s/.test(trimmed)) return false;
  return (
    /[-_:./]/.test(trimmed) ||
    // camelCase or PascalCase
    /^[a-z]+[A-Z]/.test(trimmed) ||
    /^[A-Z][a-z]+[A-Z]/.test(trimmed) ||
    // SCREAMING_CASE, and any all-caps token longer than an acronym
    /^[A-Z0-9_]{4,}$/.test(trimmed)
  );
}

/**
 * Whether one literal may become another. Identical text always may; otherwise
 * neither side may be a destination or a machine key.
 */
export function literalChangeIsSafe(before: string, after: string): boolean {
  if (before === after) return true;
  if (looksLikeLocator(before) || looksLikeLocator(after)) return false;
  return !looksLikeKey(before) && !looksLikeKey(after);
}

/**
 * A source file reduced to "everything except the words".
 *
 * `shape` is the parse tree flattened in order: every node's kind, plus the
 * text of every identifier, number, regex and operator. `literals` is every
 * string, template chunk and JSX text, in the same order.
 *
 * Two files with an identical `shape` run identically; they can only read
 * differently. That is the whole judgement, and it is made on the parse tree
 * rather than on a token stream because JSX text and template chunks are not
 * single tokens to a scanner — an earlier version of this used `ts.createScanner`
 * and quietly refused every JSX copy change, which is safe but useless.
 */
interface Shape {
  shape: string[];
  literals: string[];
}

/** Literal nodes: the only text a copy change may alter. */
function literalTextOf(node: ts.Node): string | null {
  if (ts.isStringLiteralLike(node) || ts.isJsxText(node)) return node.text;
  if (
    node.kind === ts.SyntaxKind.TemplateHead ||
    node.kind === ts.SyntaxKind.TemplateMiddle ||
    node.kind === ts.SyntaxKind.TemplateTail
  ) {
    return (node as ts.TemplateLiteralLikeNode).text;
  }
  return null;
}

/**
 * Nodes whose own text is part of behaviour: a renamed variable, a changed
 * number, a different regex. These are folded into the shape so that changing
 * one can never read as a copy change.
 */
function behaviouralTextOf(node: ts.Node): string | null {
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return node.text;
  if (ts.isNumericLiteral(node) || ts.isBigIntLiteral(node)) return node.text;
  if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
    return (node as ts.LiteralLikeNode).text;
  }
  return null;
}

function shapeOf(source: string, jsx: boolean): Shape | null {
  const file = ts.createSourceFile(
    jsx ? 'f.tsx' : 'f.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  // A file we could not parse gets no verdict. Refusing is the safe answer.
  const diagnostics = (file as unknown as { parseDiagnostics?: unknown[] })
    .parseDiagnostics;
  if (diagnostics && diagnostics.length > 0) return null;

  const shape: string[] = [];
  const literals: string[] = [];

  const visit = (node: ts.Node): void => {
    const literal = literalTextOf(node);
    if (literal !== null) {
      shape.push('L');
      literals.push(literal);
      return;
    }
    shape.push(String(node.kind));
    const behavioural = behaviouralTextOf(node);
    if (behavioural !== null) shape.push(behavioural);
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(file, visit);
  return { shape, literals };
}

/**
 * Whether `after` differs from `before` only in words.
 *
 * Both sides must parse, must have the same shape, and every literal that moved
 * must be a sentence rather than a destination.
 */
function sameExceptWords(before: string, after: string, jsx: boolean): boolean {
  const a = shapeOf(before, jsx);
  const b = shapeOf(after, jsx);
  if (!a || !b) return false;
  if (a.shape.length !== b.shape.length) return false;
  for (let i = 0; i < a.shape.length; i += 1) {
    if (a.shape[i] !== b.shape[i]) return false;
  }
  if (a.literals.length !== b.literals.length) return false;
  for (let i = 0; i < a.literals.length; i += 1) {
    if (!literalChangeIsSafe(a.literals[i], b.literals[i])) return false;
  }
  return true;
}

/**
 * HTML, split into the parts a change may touch and the parts it may not.
 *
 * `markup` keeps every tag verbatim — names, attributes and all — with the text
 * between tags replaced by a marker. Two documents with the same `markup` differ
 * only in words a reader sees; a new element, a new attribute, an `onclick=` or
 * a `javascript:` URL all change it.
 *
 * `scripts` are the inline `<script>` bodies, handed to the same tokenizer as
 * any other JavaScript. The checklist page is one enormous inline script, so
 * without this a typo fix in its data would never qualify.
 */
function splitHtml(source: string): { markup: string; scripts: string[] } {
  const scripts: string[] = [];
  const withoutScripts = source.replace(
    /<script\b[^>]*>([\s\S]*?)<\/script>/gi,
    (_match, bodyText: string) => {
      scripts.push(bodyText);
      return '<script></script>';
    },
  );
  // Keep the tags verbatim; drop the text between them, except where that text
  // is itself a locator — a bare URL printed on the page is a destination too,
  // so it stays in the compared string. Text can never contain `<` or `>`, so
  // collapsing it to nothing cannot collide with markup.
  const markup = withoutScripts.replace(/>([^<]*)</g, (_m, text) =>
    looksLikeLocator(text) ? `>${text}<` : '><',
  );
  return { markup, scripts };
}

/**
 * The verdict for one changed file.
 *
 * `before` is `null` for a file this change adds. A new prose file is still
 * only prose; a new file of anything else is new behaviour and needs a human.
 */
export function copyOnlyChange(
  path: string,
  before: string | null,
  after: string | null,
): CopyOnlyVerdict {
  if (isProtectedPath(path)) {
    return no(`${path} is a protected path — a string literal here changes behaviour`);
  }

  const ext = extensionOf(path);

  if (after === null) {
    return no(`${path} was deleted`);
  }

  if (before === null) {
    return PROSE_EXTENSIONS.has(ext)
      ? YES
      : no(`${path} is a new ${ext || 'extensionless'} file, not prose`);
  }

  if (before === after) return YES;

  if (PROSE_EXTENSIONS.has(ext)) return YES;

  if (CODE_EXTENSIONS.has(ext)) {
    return sameExceptWords(before, after, ext === 'tsx' || ext === 'jsx')
      ? YES
      : no(`${path} changes code, not just text`);
  }

  if (ext === 'html' || ext === 'htm') {
    const a = splitHtml(before);
    const b = splitHtml(after);
    if (a.markup !== b.markup) {
      return no(`${path} changes HTML structure, not just the words in it`);
    }
    if (a.scripts.length !== b.scripts.length) {
      return no(`${path} adds or removes a script block`);
    }
    for (let i = 0; i < a.scripts.length; i += 1) {
      if (!sameExceptWords(a.scripts[i], b.scripts[i], false)) {
        return no(`${path} changes script logic, not just the text in it`);
      }
    }
    return YES;
  }

  return no(`${path} is a ${ext || 'extensionless'} file — only prose, HTML and JS/TS are judged`);
}

/** The verdict for a whole changeset: copy-only only if every file is. */
export function copyOnlyChangeset(
  files: { path: string; before: string | null; after: string | null }[],
): CopyOnlyVerdict {
  if (files.length === 0) return no('nothing changed');
  for (const file of files) {
    const verdict = copyOnlyChange(file.path, file.before, file.after);
    if (!verdict.copyOnly) return verdict;
  }
  return YES;
}
