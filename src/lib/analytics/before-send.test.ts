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

  describe('secret-link pages', () => {
    const TOKEN = 'abcdef0123456789abcdef01';

    it('drops every event captured on the proposal page', () => {
      for (const properties of [
        { $current_url: `https://switchboardsocial.me/proposal/${TOKEN}`, $pathname: `/proposal/${TOKEN}` },
        { $current_url: `https://switchboardsocial.me/proposal/${TOKEN}?x=1` },
      ]) {
        expect(beforeSend(event({ event: '$pageview', properties }))).toBeNull();
        expect(beforeSend(event({ event: '$autocapture', properties }))).toBeNull();
        expect(beforeSend(event({ event: '$exception', properties }))).toBeNull();
      }
    });

    it('redacts the token wherever a later event mentions the path', () => {
      const result = beforeSend(
        event({
          event: '$pageview',
          properties: {
            $current_url: 'https://switchboardsocial.me/welcome',
            $prev_pageview_pathname: `/proposal/${TOKEN}`,
            $referrer: `https://switchboardsocial.me/proposal/${TOKEN}?a=b`,
          },
        }),
      );
      expect(result?.properties.$prev_pageview_pathname).toBe('/proposal/[redacted]');
      expect(result?.properties.$referrer).toBe('https://switchboardsocial.me/proposal/[redacted]?a=b');
      expect(JSON.stringify(result)).not.toContain(TOKEN);
    });

    it('leaves ordinary pages alone', () => {
      const result = beforeSend(
        event({ event: '$pageview', properties: { $current_url: 'https://switchboardsocial.me/features' } }),
      );
      expect(result?.properties.$current_url).toBe('https://switchboardsocial.me/features');
    });
  });
});
