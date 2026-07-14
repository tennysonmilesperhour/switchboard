import { aiEnabled, getClaude, MODELS } from './claude';
import { sanitizeUrl } from '@/lib/url';
import type { RoomItemKind } from '@/lib/types';

export interface ExtractedItem {
  kind: RoomItemKind;
  title: string;
  detail: string | null;
  url: string | null;
}

const EXTRACT_TOOL = {
  name: 'file_items',
  description:
    'File useful information from a chat message into the shared Living Room.',
  input_schema: {
    type: 'object' as const,
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: ['address', 'task', 'link', 'note', 'event'],
            },
            title: { type: 'string', description: 'Short label (≤60 chars)' },
            detail: { type: 'string', description: 'The full detail, verbatim where possible' },
            url: { type: 'string' },
          },
          required: ['kind', 'title'],
        },
      },
    },
    required: ['items'],
  },
};

const URL_PATTERN = /https?:\/\/[^\s<>"')]+/g;
const ADDRESS_PATTERN =
  /\b\d{1,5}\s+[A-Z][A-Za-z]*(?:\s[A-Za-z]+){0,3}\s(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place)\b\.?(?:,?\s+[A-Za-z .]+)?/g;
const TASK_PATTERN =
  /\b(?:i(?:'|’)ll bring|don(?:'|’)t forget|remember to|can you bring|someone bring|we need|todo:?)\s+([^.!?\n]{3,80})/gi;

/** Zero-cost fallback: regex heuristics for links, addresses, and tasks. */
export function extractWithRules(body: string): ExtractedItem[] {
  const items: ExtractedItem[] = [];

  for (const match of body.match(URL_PATTERN) ?? []) {
    let host = 'Link';
    try {
      host = new URL(match).hostname.replace(/^www\./, '');
    } catch {
      // keep default label
    }
    items.push({ kind: 'link', title: host, detail: null, url: match });
  }
  for (const match of body.match(ADDRESS_PATTERN) ?? []) {
    items.push({ kind: 'address', title: match.trim(), detail: null, url: null });
  }
  for (const match of body.matchAll(TASK_PATTERN)) {
    items.push({
      kind: 'task',
      title: match[1].trim(),
      detail: null,
      url: null,
    });
  }
  return items;
}

/**
 * Living Room auto-organization. Uses Haiku when available; rules otherwise.
 * The AI should feel like good architecture - "of course it's there".
 */
export async function extractItems(body: string): Promise<ExtractedItem[]> {
  if (!aiEnabled()) return extractWithRules(body);

  try {
    const response = await getClaude().messages.create({
      model: MODELS.fast,
      max_tokens: 600,
      system:
        'You quietly organize a group chat. Extract only genuinely useful, ' +
        'reusable information: street addresses (kind=address), concrete tasks ' +
        'someone should do (kind=task), URLs (kind=link), and important notes ' +
        'like door codes or decisions (kind=note). Most messages contain ' +
        'NOTHING worth filing - return an empty list for chit-chat. Never ' +
        'invent information.',
      tools: [EXTRACT_TOOL],
      tool_choice: { type: 'tool', name: 'file_items' },
      messages: [{ role: 'user', content: body }],
    });

    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') return extractWithRules(body);
    const parsed = toolUse.input as { items?: ExtractedItem[] };
    return (parsed.items ?? [])
      .filter((item) => item.title?.trim())
      .slice(0, 5)
      .map((item) => ({
        kind: item.kind ?? 'note',
        title: item.title.slice(0, 120),
        detail: item.detail?.slice(0, 500) ?? null,
        url: item.url ? sanitizeUrl(item.url) : null,
      }));
  } catch {
    return extractWithRules(body);
  }
}
