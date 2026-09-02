import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  Anthropic: vi.fn(function AnthropicMock() {}),
}));

vi.mock('@anthropic-ai/sdk', () => ({ default: mocks.Anthropic }));

import {
  AI_MAX_RETRIES,
  AI_TIMEOUT_MS,
  getClaude,
} from './claude';

describe('getClaude', () => {
  it('bounds every model call and reuses the configured client', () => {
    const first = getClaude();
    const second = getClaude();

    expect(first).toBe(second);
    expect(mocks.Anthropic).toHaveBeenCalledTimes(1);
    expect(mocks.Anthropic).toHaveBeenCalledWith({
      timeout: AI_TIMEOUT_MS,
      maxRetries: AI_MAX_RETRIES,
    });
    expect(AI_TIMEOUT_MS).toBe(10_000);
    expect(AI_MAX_RETRIES).toBe(1);
  });
});
