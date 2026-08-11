import { describe, expect, it } from 'vitest';
import type { CaptureResult } from 'posthog-js';
import { beforeSend } from './before-send';

function event(partial: Partial<CaptureResult>): CaptureResult {
  return { event: '$pageview', properties: {}, ...partial } as CaptureResult;
}

describe('beforeSend', () => {
  it('passes null straight through', () => {
    expect(beforeSend(null)).toBeNull();
  });

  it('tags ordinary events with the app name', () => {
    const result = beforeSend(
      event({ event: '$pageview', properties: { $current_url: '/' } }),
    );
    expect(result?.properties.app).toBe('switchboard');
  });

  it('drops NEXT_REDIRECT control-flow exceptions', () => {
    const result = beforeSend(
      event({
        event: '$exception',
        properties: {
          $exception_list: [{ type: 'Error', value: 'NEXT_REDIRECT' }],
        },
      }),
    );
    expect(result).toBeNull();
  });

  it('drops NEXT_NOT_FOUND control-flow exceptions', () => {
    const result = beforeSend(
      event({
        event: '$exception',
        properties: {
          $exception_list: [{ type: 'Error', value: 'NEXT_NOT_FOUND' }],
        },
      }),
    );
    expect(result).toBeNull();
  });

  it('keeps and tags genuine exceptions', () => {
    const result = beforeSend(
      event({
        event: '$exception',
        properties: {
          $exception_list: [
            {
              type: 'TypeError',
              value: "null is not an object (evaluating 'x.content')",
            },
          ],
        },
      }),
    );
    expect(result).not.toBeNull();
    expect(result?.properties.app).toBe('switchboard');
  });
});
