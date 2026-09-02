import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const WORKFLOW = readFileSync(
  join(ROOT, '.github/workflows/deploy-migrations.yml'),
  'utf8',
);
const DEPLOYMENT_DOC = readFileSync(join(ROOT, 'docs/DEPLOYMENT.md'), 'utf8');
const VERCEL_CONFIG = JSON.parse(
  readFileSync(join(ROOT, 'vercel.json'), 'utf8'),
) as {
  git?: { deploymentEnabled?: Record<string, boolean> };
};

describe('production deployment gate', () => {
  it('disables the automatic main-branch Vercel deployment', () => {
    expect(VERCEL_CONFIG.git?.deploymentEnabled?.main).toBe(false);
  });

  it('serializes production migration jobs without cancelling an in-flight push', () => {
    expect(WORKFLOW).toMatch(
      /concurrency:\s*\n\s+group: db-push\s*\n\s+cancel-in-progress: false/,
    );
    expect(WORKFLOW).toMatch(/environment: production/);
  });

  it('requires the deploy hook before changing the database', () => {
    const preflight = WORKFLOW.indexOf('Preflight — require deploy secrets');
    const push = WORKFLOW.indexOf('Push migrations to production');

    expect(preflight).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(preflight);
    expect(WORKFLOW.slice(preflight, push)).toContain(
      '[ -z "$VERCEL_DEPLOY_HOOK_URL" ]',
    );
  });

  it('triggers Vercel only after the schema parity check', () => {
    const parity = WORKFLOW.indexOf('Verify schema parity');
    const deploy = WORKFLOW.indexOf('Trigger production deployment');

    expect(parity).toBeGreaterThan(-1);
    expect(deploy).toBeGreaterThan(parity);
    expect(WORKFLOW.slice(deploy)).toContain('secrets.VERCEL_DEPLOY_HOOK_URL');
    expect(WORKFLOW.slice(deploy)).toContain('curl --silent --show-error');
  });

  it('documents the real secret set and rollback path', () => {
    expect(DEPLOYMENT_DOC).not.toContain('SUPABASE_DB_PASSWORD');
    expect(DEPLOYMENT_DOC).toContain('VERCEL_DEPLOY_HOOK_URL');
    expect(DEPLOYMENT_DOC).toContain('## Rollback and recovery');
    expect(DEPLOYMENT_DOC).toContain('Point-in-Time Recovery');
  });
});
