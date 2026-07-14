import { aiEnabled, getClaude, MODELS } from './claude';

export type ReflectionKind = 'general' | 'relationships' | 'desires';

export interface ReflectionFacet {
  title: string;
  summary: string;
}

const PROMPTS: Record<ReflectionKind, string> = {
  general:
    'Reflect back to this person who they seem to be, socially, based only on ' +
    'the reads below. Two short paragraphs. Warm, specific, never flattering ' +
    'for its own sake. Name a throughline they might not have noticed.',
  relationships:
    'Using only the reads below, reflect on how this person tends to relate to ' +
    'others — where they invest, how they show up, what kind of company suits ' +
    'them. Two short paragraphs. Insightful, never clinical, and never rank or ' +
    'name specific people.',
  desires:
    'Using only the reads below, gently name the gap between what this person ' +
    'seems drawn to and what they actually make time for, then suggest two or ' +
    'three concrete, low-pressure ways to move toward what they say they want. ' +
    'Encouraging, not scolding. One short paragraph plus a few suggestions.',
};

function fallback(kind: ReflectionKind, facets: ReflectionFacet[]): string {
  const lines = facets.map((f) => `• ${f.summary}`).join('\n');
  const opener: Record<ReflectionKind, string> = {
    general: 'Here’s what your recent patterns add up to:',
    relationships: 'On how you tend to relate to people:',
    desires: 'On the distance between what draws you and where your time goes:',
  };
  return (
    `${opener[kind]}\n\n${lines}\n\n` +
    '(Connect an Anthropic key for a fuller, written reflection - this is the ' +
    'plain-language version drawn straight from your reads.)'
  );
}

/**
 * A written reflection over the user's own facets. AI is a bonus, never a
 * blocker: with no key, or on any failure, it falls back to a deterministic
 * synthesis of the same reads.
 */
export async function generateReflection(
  kind: ReflectionKind,
  facets: ReflectionFacet[],
): Promise<{ body: string; source: 'ai' | 'fallback' }> {
  if (facets.length === 0) {
    return { body: fallback(kind, facets), source: 'fallback' };
  }
  if (!aiEnabled()) return { body: fallback(kind, facets), source: 'fallback' };

  try {
    const response = await getClaude().messages.create({
      model: MODELS.smart,
      max_tokens: 700,
      system:
        'You are Switchboard’s private, gentle mirror. You reflect a person ' +
        'back to themselves from behavioral reads they already own. Second ' +
        'person ("you"). Never invent facts beyond the reads. Never judge, ' +
        'diagnose, rank people, or push them to be more social than they want ' +
        'to be — some rest and some hard plans are both fine. ' +
        PROMPTS[kind],
      messages: [
        {
          role: 'user',
          content:
            'My reads:\n' +
            facets.map((f) => `- ${f.title}: ${f.summary}`).join('\n'),
        },
      ],
    });
    const text = response.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('\n')
      .trim();
    if (!text) return { body: fallback(kind, facets), source: 'fallback' };
    return { body: text, source: 'ai' };
  } catch {
    return { body: fallback(kind, facets), source: 'fallback' };
  }
}
