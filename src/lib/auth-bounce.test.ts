import { describe, expect, it } from 'vitest';
import {
  AUTH_BOUNCE_MAX_AGE_SECONDS,
  authLandingAction,
  isAuthLandingPath,
} from './auth-bounce';

describe('isAuthLandingPath', () => {
  it('matches the two public auth pages the proxy bounces off', () => {
    expect(isAuthLandingPath('/login')).toBe(true);
    expect(isAuthLandingPath('/welcome')).toBe(true);
  });

  it('does not match protected routes or nested auth paths', () => {
    expect(isAuthLandingPath('/')).toBe(false);
    expect(isAuthLandingPath('/onboarding')).toBe(false);
    expect(isAuthLandingPath('/auth/callback')).toBe(false);
    // Only the exact pages redirect; a sub-path must still render.
    expect(isAuthLandingPath('/login/help')).toBe(false);
  });
});

describe('authLandingAction', () => {
  it('bounces a signed-in visitor into the app on first arrival', () => {
    expect(authLandingAction(false)).toBe('bounce');
  });

  it('releases the browser once it has already been bounced', () => {
    // This is the loop breaker: the page-level check disagreed with the proxy
    // and sent them straight back. Redirecting again would spin forever.
    expect(authLandingAction(true)).toBe('release');
  });
});

describe('AUTH_BOUNCE_MAX_AGE_SECONDS', () => {
  it('outlives one redirect without surviving into a later sign-in', () => {
    expect(AUTH_BOUNCE_MAX_AGE_SECONDS).toBeGreaterThan(0);
    expect(AUTH_BOUNCE_MAX_AGE_SECONDS).toBeLessThanOrEqual(30);
  });
});
