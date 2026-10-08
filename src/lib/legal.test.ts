import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { LEGAL_VERSION } from './legal';

it('keeps database RSVP eligibility on the same terms version as the app', () => {
  const directory = join(process.cwd(), 'supabase/migrations');
  const migrations = readdirSync(directory).filter(name => name.endsWith('.sql')).sort();
  for (const functionName of ['require_rsvp_profile', 'approve_join_request', 'handle_sms_command']) {
    const definitions = migrations.flatMap(name =>
      [...readFileSync(join(directory, name), 'utf8').matchAll(
        new RegExp(`create or replace function private\\.${functionName}\\([\\s\\S]*?as (\\$[a-z_]*\\$)([\\s\\S]*?)\\1`, 'gi'),
      )].map(match => match[2]),
    );
    const body = definitions.at(-1);
    expect(body, functionName).toBeDefined();
    expect(body, functionName).toMatch(new RegExp(`legal_terms_version\\s*(?:is distinct from|=)\\s*'${LEGAL_VERSION}'`, 'i'));
  }
});
