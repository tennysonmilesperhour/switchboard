import Anthropic from '@anthropic-ai/sdk';

export const AI_TIMEOUT_MS = 10_000;
export const AI_MAX_RETRIES = 1;

/** AI features degrade gracefully when no key is configured. */
export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;

export function getClaude(): Anthropic {
  if (!client) {
    client = new Anthropic({
      timeout: AI_TIMEOUT_MS,
      maxRetries: AI_MAX_RETRIES,
    }); // reads ANTHROPIC_API_KEY
  }
  return client;
}

export const MODELS = {
  /** Fast classification/extraction - Living Rooms, serendipity scoring. */
  fast: 'claude-haiku-4-5-20251001',
  /** Curation and reasoning - Smart Activity Discovery. */
  smart: 'claude-sonnet-4-6',
} as const;
