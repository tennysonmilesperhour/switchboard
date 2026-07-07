import { describe, expect, test } from 'vitest';
import { resolveBuildId } from './build-id';

describe('resolveBuildId', () => {
  test('prefers the git commit SHA', () => {
    expect(
      resolveBuildId({ VERCEL: '1', VERCEL_GIT_COMMIT_SHA: 'abc123', VERCEL_DEPLOYMENT_ID: 'dpl_x' }),
    ).toBe('abc123');
  });

  test('falls back to the deployment id when no SHA', () => {
    expect(resolveBuildId({ VERCEL: '1', VERCEL_DEPLOYMENT_ID: 'dpl_x' })).toBe('dpl_x');
  });

  test('on Vercel with no git metadata, still produces a unique non-dev id', () => {
    const id = resolveBuildId({ VERCEL: '1' });
    expect(id).not.toBe('dev');
    expect(id.startsWith('build-')).toBe(true);
  });

  test('locally (not on Vercel) it is "dev" so the watcher stays quiet', () => {
    expect(resolveBuildId({})).toBe('dev');
  });
});
