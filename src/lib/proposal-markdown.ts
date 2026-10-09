/**
 * A deliberately small Markdown reader for `docs/PROPOSAL.md`.
 *
 * The proposal is edited as plain Markdown by people and by other AI tools, and
 * rendered at `/proposal/<token>`. The output is a tree of typed nodes that React
 * turns into elements, so text is escaped by React and nothing here ever builds
 * an HTML string (docs/SECURITY.md §6). A full Markdown library would accept raw
 * HTML, images and autolinks; this one accepts only what the document needs:
 *
 * - `#`, `##`, `###` headings
 * - paragraphs
 * - flat bullet lists, numbered lists and `- [ ]` / `- [x]` task lists
 * - pipe tables
 * - `**bold**`, `` `code` `` and `[text](https://url)` links (no italics,
 *   strikethrough or images)
 *
 * Anything else is not rendered as markup. `unsupportedMarkdown` names it, and
 * `proposal-markdown.test.ts` fails the build when the proposal uses it, so an
 * editor learns that a blockquote or a nested list will not show up before it
 * ships and not after.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'link'; href: string; children: Inline[] };

export interface ListItem {
  /** `null` for an ordinary item, a boolean for a task-list item. */
  checked: boolean | null;
  content: Inline[];
}

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; id: string; content: Inline[] }
  | { kind: 'paragraph'; content: Inline[] }
  | { kind: 'list'; ordered: boolean; items: ListItem[] }
  | { kind: 'table'; header: Inline[][]; rows: Inline[][][] };

export interface UnsupportedMarkdown {
  /** 1-based line number in the source. */
  line: number;
  text: string;
  reason: string;
}

/** Only absolute http(s) links render as links; anything else keeps its label. */
function linkHref(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ kind: 'text', text });
    text = '';
  };

  let i = 0;
  while (i < source.length) {
    const ch = source[i];

    if (ch === '`') {
      const end = source.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ kind: 'code', text: source.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if (ch === '*' && source[i + 1] === '*') {
      const end = source.indexOf('**', i + 2);
      if (end > i + 2) {
        flush();
        out.push({ kind: 'strong', children: parseInline(source.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if (ch === '[') {
      const match = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(source.slice(i));
      if (match) {
        flush();
        const href = linkHref(match[2]);
        const children = parseInline(match[1]);
        if (href) out.push({ kind: 'link', href, children });
        else out.push(...children);
        i += match[0].length;
        continue;
      }
    }

    if (ch === '\\' && i + 1 < source.length) {
      text += source[i + 1];
      i += 2;
      continue;
    }

    text += ch;
    i += 1;
  }
  flush();
  return out;
}

/** Plain text of an inline run, for heading ids and tests. */
export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((node) =>
      node.kind === 'text' || node.kind === 'code' ? node.text : inlineText(node.children),
    )
    .join('');
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const TABLE_SEPARATOR = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const BULLET = /^[-*]\s+(.*)$/;
const NUMBERED = /^\d+\.\s+(.*)$/;
const TASK = /^\[([ xX])\]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;

function splitRow(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let inCode = false;
  const body = line.trim().replace(/^\|/, '');
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '`') inCode = !inCode;
    if (ch === '\\' && body[i + 1] === '|') {
      cell += '|';
      i += 1;
      continue;
    }
    if (ch === '|' && !inCode) {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += ch;
  }
  if (cell.trim() !== '') cells.push(cell.trim());
  return cells;
}

function startsBlock(line: string, next: string | undefined): boolean {
  return (
    HEADING.test(line) ||
    BULLET.test(line) ||
    NUMBERED.test(line) ||
    (line.startsWith('|') && next !== undefined && TABLE_SEPARATOR.test(next))
  );
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  const usedIds = new Map<string, number>();
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trimEnd();
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const content = parseInline(heading[2].trim());
      const base = slug(inlineText(content)) || 'section';
      const seen = usedIds.get(base) ?? 0;
      usedIds.set(base, seen + 1);
      blocks.push({
        kind: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        id: seen === 0 ? base : `${base}-${seen + 1}`,
        content,
      });
      i += 1;
      continue;
    }

    if (line.startsWith('|') && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1].trim())) {
      const header = splitRow(line).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i]).map(parseInline));
        i += 1;
      }
      blocks.push({ kind: 'table', header, rows });
      continue;
    }

    const listKind = BULLET.test(line) ? 'bullet' : NUMBERED.test(line) ? 'numbered' : null;
    if (listKind) {
      const pattern = listKind === 'bullet' ? BULLET : NUMBERED;
      const items: ListItem[] = [];
      while (i < lines.length) {
        const match = pattern.exec(lines[i].trimEnd());
        if (!match) break;
        const task = listKind === 'bullet' ? TASK.exec(match[1]) : null;
        items.push(
          task
            ? { checked: task[1] !== ' ', content: parseInline(task[2]) }
            : { checked: null, content: parseInline(match[1]) },
        );
        i += 1;
      }
      blocks.push({ kind: 'list', ordered: listKind === 'numbered', items });
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && (paragraph.length === 0 || !startsBlock(lines[i].trimEnd(), lines[i + 1]?.trim()))) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ kind: 'paragraph', content: parseInline(paragraph.join(' ')) });
  }

  return blocks;
}

/** What the reader above does not render, with the line it is on. */
export function unsupportedMarkdown(source: string): UnsupportedMarkdown[] {
  const found: UnsupportedMarkdown[] = [];
  source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((text, index) => {
      const add = (reason: string) => found.push({ line: index + 1, text, reason });
      const withoutCode = text.replace(/`[^`]*`/g, '');

      if (/^\s*>/.test(text)) add('blockquotes are not rendered');
      else if (/^\s*(```|~~~)/.test(text)) add('fenced code blocks are not rendered');
      else if (/^#{4,}\s/.test(text)) add('headings deeper than ### are not rendered');
      else if (/^\s+([-*]|\d+\.)\s/.test(text)) add('nested or indented lists are not rendered');
      else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(text)) add('horizontal rules are not rendered');
      else if (/<\/?[a-z][^>]*>/i.test(withoutCode)) add('raw HTML is never rendered');
      else if (/!\[[^\]]*\]\(/.test(withoutCode)) add('images are not rendered');
      else {
        // Inline emphasis the reader does not draw: it would show as literal
        // delimiter characters. **bold** is the only emphasis it renders.
        const plain = withoutCode
          .replace(/\*\*[^*]+\*\*/g, '')
          .replace(/^\s*[-*]\s+/, '');
        if (plain.includes('*')) add('italics with * are not rendered; use **bold** or plain text');
        else if (plain.includes('~~')) add('strikethrough is not rendered');
        else if (/(^|[\s(])_{1,2}[^_\s][^_]*_{1,2}(?=$|[\s).,;:!?])/.test(plain)) {
          add('emphasis with _ is not rendered; use **bold** or plain text');
        }
      }
    });
  return found;
}
