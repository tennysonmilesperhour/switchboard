import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  inlineText,
  parseInline,
  parseMarkdown,
  unsupportedMarkdown,
  type Block,
} from './proposal-markdown';

const PROPOSAL = readFileSync(join(process.cwd(), 'docs/PROPOSAL.md'), 'utf8');

describe('parseInline', () => {
  it('reads bold, code and https links', () => {
    expect(parseInline('a **b** `c` [d](https://example.com/x)')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'strong', children: [{ kind: 'text', text: 'b' }] },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'c' },
      { kind: 'text', text: ' ' },
      { kind: 'link', href: 'https://example.com/x', children: [{ kind: 'text', text: 'd' }] },
    ]);
  });

  it('never makes a link out of a script or data URL', () => {
    for (const href of ['javascript:alert', 'data:text/html,x', 'vbscript:x', '/relative']) {
      const nodes = parseInline(`[click](${href})`);
      expect(nodes.some((node) => node.kind === 'link'), href).toBe(false);
      expect(inlineText(nodes)).toBe('click');
    }
  });

  it('keeps markup-looking text as text for React to escape', () => {
    const nodes = parseInline('<script>alert(1)</script> and <img src=x onerror=y>');
    expect(nodes).toEqual([
      { kind: 'text', text: '<script>alert(1)</script> and <img src=x onerror=y>' },
    ]);
  });
});

describe('parseMarkdown', () => {
  it('reads headings, paragraphs, lists and task lists', () => {
    const blocks = parseMarkdown(
      '# Title\n\nFirst line\nsecond line\n\n- one\n- two\n\n1. a\n2. b\n\n- [ ] open\n- [x] done\n',
    );
    expect(blocks.map((block) => block.kind)).toEqual([
      'heading',
      'paragraph',
      'list',
      'list',
      'list',
    ]);
    const [, paragraph, bullets, numbered, tasks] = blocks;
    expect(paragraph).toMatchObject({ content: [{ kind: 'text', text: 'First line second line' }] });
    expect(bullets).toMatchObject({ ordered: false });
    expect(numbered).toMatchObject({ ordered: true });
    expect((tasks as Extract<Block, { kind: 'list' }>).items.map((item) => item.checked)).toEqual([
      false,
      true,
    ]);
  });

  it('reads a table and keeps a pipe inside code in its cell', () => {
    const [table] = parseMarkdown('| A | B |\n| --- | --- |\n| `x | y` | 2 |\n');
    expect(table.kind).toBe('table');
    const rows = (table as Extract<Block, { kind: 'table' }>).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(2);
    expect(inlineText(rows[0][0])).toBe('x | y');
  });

  it('gives repeated headings distinct ids', () => {
    const ids = parseMarkdown('## Risks\n\n## Risks\n')
      .filter((block) => block.kind === 'heading')
      .map((block) => (block as Extract<Block, { kind: 'heading' }>).id);
    expect(ids).toEqual(['risks', 'risks-2']);
  });
});

describe('unsupportedMarkdown', () => {
  it('names the constructs the page would drop', () => {
    const found = unsupportedMarkdown(
      ['> quote', '```', '#### deep', '  - nested', '---', '<div>x</div>', '![a](b)'].join('\n'),
    ).map((entry) => entry.reason);
    expect(found).toEqual([
      'blockquotes are not rendered',
      'fenced code blocks are not rendered',
      'headings deeper than ### are not rendered',
      'nested or indented lists are not rendered',
      'horizontal rules are not rendered',
      'raw HTML is never rendered',
      'images are not rendered',
    ]);
  });

  it('allows angle brackets inside code spans and table separators', () => {
    expect(unsupportedMarkdown('Links at `/i/<token>` open.\n\n| a |\n| --- |\n| b |')).toEqual([]);
  });
});

/**
 * The proposal is edited by people and by other AI tools. These checks fail the
 * build when an edit uses syntax the page cannot draw, so the live page cannot
 * quietly lose a section.
 */
describe('docs/PROPOSAL.md', () => {
  it('uses only syntax the page renders', () => {
    expect(unsupportedMarkdown(PROPOSAL)).toEqual([]);
  });

  it('opens with one title and has the sections the page is for', () => {
    const headings = parseMarkdown(PROPOSAL).filter(
      (block): block is Extract<Block, { kind: 'heading' }> => block.kind === 'heading',
    );
    expect(headings.filter((heading) => heading.level === 1)).toHaveLength(1);
    const titles = headings.map((heading) => inlineText(heading.content));
    for (const required of ['Summary', 'Stages', 'Fees and payment', 'Risks and mitigations']) {
      expect(titles, `missing section ${required}`).toContain(required);
    }
    expect(new Set(headings.map((heading) => heading.id)).size).toBe(headings.length);
  });

  it('keeps meeting new people in the pitch', () => {
    // The deck was once drafted around planning alone. The product has two
    // headline halves, and the proposal must keep naming both.
    expect(PROPOSAL).toContain('Meeting new people');
    expect(PROPOSAL).toContain('Open Table');
    expect(PROPOSAL).toContain('Mutual');
  });

  it('gives every table row as many cells as its header', () => {
    // A stray pipe in a cell shifts every column after it. Fail instead of
    // rendering a misaligned table.
    for (const block of parseMarkdown(PROPOSAL)) {
      if (block.kind !== 'table') continue;
      for (const row of block.rows) {
        expect(row.length, inlineText(row[0] ?? [])).toBe(block.header.length);
      }
    }
  });

  it('links only to https addresses', () => {
    const hrefs = [...PROPOSAL.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);
    for (const href of hrefs) expect(href).toMatch(/^https:\/\//);
  });
});
