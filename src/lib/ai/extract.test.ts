import { describe, it, expect, beforeEach, vi } from 'vitest';
import { extractItems, extractWithRules } from './extract';
import { ROOM_ITEM_KINDS } from '@/lib/types';

const create = vi.hoisted(() => vi.fn());

vi.mock('./claude', () => ({
  aiEnabled: () => true,
  getClaude: () => ({ messages: { create } }),
  MODELS: { fast: 'test-fast', smart: 'test-smart' },
}));

/** Shape one `file_items` tool call the way the SDK hands it back. */
function toolResponse(items: unknown[]) {
  return { content: [{ type: 'tool_use', name: 'file_items', input: { items } }] };
}

// Braced body on purpose: a concise arrow would return the mock, and Vitest
// treats a function returned from a hook as its teardown — it would then call
// `create` again after the test, with whatever implementation that test left.
beforeEach(() => {
  create.mockReset();
});

describe('extractWithRules', () => {
  it('files a URL as a link labelled by its host', () => {
    expect(extractWithRules('menu here https://www.taqueria.example/menu')).toEqual([
      {
        kind: 'link',
        title: 'taqueria.example',
        detail: null,
        url: 'https://www.taqueria.example/menu',
      },
    ]);
  });

  it('files a street address as an address', () => {
    const items = extractWithRules('meet at 442 Pine Street, Salt Lake City');
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('address');
    expect(items[0].title).toContain('442 Pine Street');
  });

  it('files a commitment as a task', () => {
    expect(extractWithRules('I’ll bring the folding chairs')).toEqual([
      { kind: 'task', title: 'the folding chairs', detail: null, url: null },
    ]);
  });

  it('files nothing for chit-chat', () => {
    expect(extractWithRules('haha same')).toEqual([]);
  });
});

describe('extractItems', () => {
  it('keeps a well-formed item as the model filed it', async () => {
    create.mockResolvedValue(
      toolResponse([
        { kind: 'address', title: 'The cabin', detail: '9 Aspen Loop', url: null },
      ]),
    );
    await expect(extractItems('the cabin is at 9 Aspen Loop')).resolves.toEqual([
      { kind: 'address', title: 'The cabin', detail: '9 Aspen Loop', url: null },
    ]);
  });

  /**
   * The whole reason `safeKind` exists. `room_items.kind` has a CHECK on six
   * values and a message's items are inserted as one array, so a single
   * out-of-set kind rejects the batch — and the caller files these best-effort
   * inside a `catch`, so the room is never told. Everything in the message
   * vanishes, and auto-sorting appears to have quietly stopped working.
   */
  it('never emits a kind the room_items CHECK would refuse', async () => {
    create.mockResolvedValue(
      toolResponse([
        { kind: 'todo', title: 'Bring ice' },
        { kind: 'reminder', title: 'Door code 4417' },
        { kind: null, title: 'Parking is out back' },
        { kind: 'task', title: 'Pick up the cake' },
      ]),
    );
    const items = await extractItems('a message with several filings');
    expect(items.map((item) => item.kind)).toEqual(['note', 'note', 'note', 'task']);
    for (const item of items) {
      expect(ROOM_ITEM_KINDS).toContain(item.kind);
    }
  });

  it('drops an item whose title is missing or not text', async () => {
    create.mockResolvedValue(
      toolResponse([{ kind: 'note', title: 42 }, { kind: 'note', title: '  ' }, { kind: 'note' }]),
    );
    await expect(extractItems('nothing usable')).resolves.toEqual([]);
  });

  it('survives a non-string detail or url instead of losing the message', async () => {
    create.mockResolvedValue(
      toolResponse([{ kind: 'link', title: 'Tickets', detail: 7, url: 12 }]),
    );
    await expect(extractItems('tickets')).resolves.toEqual([
      { kind: 'link', title: 'Tickets', detail: null, url: null },
    ]);
  });

  it('refuses a javascript: url the model handed back', async () => {
    create.mockResolvedValue(
      toolResponse([
        { kind: 'link', title: 'Menu', url: 'javascript:alert(1)' },
      ]),
    );
    const [item] = await extractItems('menu');
    expect(item.url).toBeNull();
  });

  it('caps a message at five filings', async () => {
    create.mockResolvedValue(
      toolResponse(
        Array.from({ length: 9 }, (_, i) => ({ kind: 'note', title: `note ${i}` })),
      ),
    );
    await expect(extractItems('a long message')).resolves.toHaveLength(5);
  });

  it('falls back to the rules when the model call throws', async () => {
    create.mockImplementation(async () => {
      throw new Error('upstream down');
    });
    const items = await extractItems('menu here https://taqueria.example/menu');
    expect(items).toEqual([
      {
        kind: 'link',
        title: 'taqueria.example',
        detail: null,
        url: 'https://taqueria.example/menu',
      },
    ]);
  });

  it('falls back to the rules when the model answers without the tool', async () => {
    create.mockResolvedValue({ content: [{ type: 'text', text: 'sure thing' }] });
    await expect(
      extractItems('I’ll bring the folding chairs'),
    ).resolves.toEqual([
      { kind: 'task', title: 'the folding chairs', detail: null, url: null },
    ]);
  });
});
