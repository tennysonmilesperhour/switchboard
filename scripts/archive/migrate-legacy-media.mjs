// One-time migration: move access-gated media that predates the private-bucket
// change out of the PUBLIC `media` bucket and into `media-private`, and rewrite
// the DB column from a public URL to the bare storage path (which the app signs
// on read). New uploads already land in `media-private`; this only fixes rows
// created before that.
//
// Safe to run repeatedly. DRY-RUN BY DEFAULT — it only reports what it would do.
// Pass --apply to actually copy objects and rewrite columns:
//
//   node --env-file-if-exists=.env.local scripts/archive/migrate-legacy-media.mjs          # dry run
//   node --env-file-if-exists=.env.local scripts/archive/migrate-legacy-media.mjs --apply  # execute
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role,
// so RLS is bypassed for the rewrite). Point it at the project whose data you
// want to migrate.

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes('--apply');

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PUBLIC_BUCKET = 'media';
const PRIVATE_BUCKET = 'media-private';
const PUBLIC_MARKER = `/storage/v1/object/public/${PUBLIC_BUCKET}/`;

// Each gated-media column: which table, its primary key, and the column holding
// the reference.
const TARGETS = [
  { table: 'capsule_entries', pk: 'id', column: 'photo_url' },
  { table: 'event_comments', pk: 'id', column: 'voice_url' },
  { table: 'events', pk: 'id', column: 'cancel_voice_url' },
];

/** Extract the storage object path from a public media URL, or null if it isn't one. */
function pathFromPublicUrl(value) {
  if (typeof value !== 'string' || !value.includes(PUBLIC_MARKER)) return null;
  const after = value.split(PUBLIC_MARKER)[1];
  if (!after) return null;
  return decodeURIComponent(after.split('?')[0]); // strip cache-busting ?v=
}

/** Copy one object from the public bucket to the private bucket (idempotent). */
async function copyObject(path) {
  // Skip if it already exists in the private bucket.
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const name = path.slice(path.lastIndexOf('/') + 1);
  const { data: existing } = await admin.storage.from(PRIVATE_BUCKET).list(dir, {
    search: name,
    limit: 1,
  });
  if (existing && existing.some((o) => o.name === name)) return 'already-private';

  const { data: blob, error: dlErr } = await admin.storage
    .from(PUBLIC_BUCKET)
    .download(path);
  if (dlErr || !blob) return `download-failed: ${dlErr?.message ?? 'no data'}`;

  const buf = Buffer.from(await blob.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(PRIVATE_BUCKET)
    .upload(path, buf, { contentType: blob.type || undefined, upsert: false });
  if (upErr && !/exists/i.test(upErr.message)) return `upload-failed: ${upErr.message}`;
  return 'copied';
}

async function run() {
  console.log(APPLY ? '=== APPLY MODE (mutating) ===' : '=== DRY RUN (no changes) ===');
  let totalLegacy = 0;
  let totalMigrated = 0;

  for (const { table, pk, column } of TARGETS) {
    const { data: rows, error } = await admin
      .from(table)
      .select(`${pk}, ${column}`)
      .like(column, `%${PUBLIC_MARKER}%`);
    if (error) {
      console.error(`  ${table}.${column}: query failed — ${error.message}`);
      continue;
    }

    const legacy = rows ?? [];
    totalLegacy += legacy.length;
    console.log(`\n${table}.${column}: ${legacy.length} legacy public row(s)`);

    for (const row of legacy) {
      const path = pathFromPublicUrl(row[column]);
      if (!path) continue;
      if (!APPLY) {
        console.log(`  would migrate ${pk}=${row[pk]} -> ${path}`);
        continue;
      }
      const result = await copyObject(path);
      if (result === 'copied' || result === 'already-private') {
        const { error: updErr } = await admin
          .from(table)
          .update({ [column]: path })
          .eq(pk, row[pk]);
        if (updErr) {
          console.error(`  ${pk}=${row[pk]}: db update failed — ${updErr.message}`);
        } else {
          totalMigrated += 1;
          console.log(`  migrated ${pk}=${row[pk]} (${result}) -> ${path}`);
        }
      } else {
        console.error(`  ${pk}=${row[pk]}: ${result}`);
      }
    }
  }

  console.log(
    `\nDone. ${totalLegacy} legacy row(s) found${
      APPLY ? `, ${totalMigrated} migrated` : ' (dry run — pass --apply to migrate)'
    }.`,
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
