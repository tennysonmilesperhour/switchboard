import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startSupabase } from "./start-supabase.mjs";

const transientError = "failed to pull docker image from all registries: public.ecr.aws/supabase/postgres:17\nError response from daemon: toomanyrequests: retry-after: 358.521µs, allowed: 44000/minute\n";

function fixture(t, steps) {
  const directory = mkdtempSync(join(tmpdir(), "switchboard-ci-start-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const callsFile = join(directory, "calls.jsonl");
  const envFile = join(directory, "github-env");
  const command = join(directory, "supabase");
  // This records real argv/env and can hang while ignoring SIGTERM, so tests
  // exercise the supervisor and command contract, not just regex helpers.
  writeFileSync(command, `#!${process.execPath}\n
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
const callsFile = ${JSON.stringify(callsFile)};
const count = existsSync(callsFile) ? readFileSync(callsFile, 'utf8').trim().split('\\n').length : 0;
appendFileSync(callsFile, JSON.stringify({ args: process.argv.slice(2), registry: process.env.SUPABASE_INTERNAL_IMAGE_REGISTRY }) + '\\n');
const step = ${JSON.stringify(steps)}[count];
if (!step) { console.error('Unexpected extra command'); process.exit(98); }
if (step.output) process.stderr.write(step.output);
if (step.hang) {
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
} else setTimeout(() => process.exit(step.code ?? 0), step.delay ?? 0);
`, { mode: 0o755 });
  let output = "";
  return {
    run: (overrides = {}) => startSupabase({
      cwd: directory,
      command,
      env: { ...process.env, GITHUB_ACTIONS: "true", GITHUB_ENV: envFile, SUPABASE_INTERNAL_IMAGE_REGISTRY: "ghcr.io" },
      timeoutMs: 10_000,
      cleanupTimeoutMs: 2_000,
      killGraceMs: 100,
      write: (text) => { output += text; },
      ...overrides,
    }),
    calls: () => existsSync(callsFile) ? readFileSync(callsFile, "utf8").trim().split("\n").map(JSON.parse) : [],
    exported: () => existsSync(envFile) ? readFileSync(envFile, "utf8") : "",
    output: () => output,
    directory,
  };
}

test("starts from ECR, retains all required services and exports the working registry", async (t) => {
  const f = fixture(t, [{ output: "Started local development setup.\n" }]);
  assert.equal(await f.run(), 0);
  assert.deepEqual(f.calls(), [{
    args: ["start", "-x", "studio,logflare,vector,imgproxy,edge-runtime", "--workdir", f.directory],
    registry: "public.ecr.aws",
  }]);
  assert.equal(f.exported(), "SUPABASE_INTERNAL_IMAGE_REGISTRY=public.ecr.aws\n");
  assert.match(f.output(), /Started local development setup/);
});

test("a transient pull failure gets exactly one cleaned-up mirror fallback", async (t) => {
  const f = fixture(t, [{ code: 23, output: transientError }, {}, {}]);
  assert.equal(await f.run(), 0);
  assert.deepEqual(f.calls().map(({ args, registry }) => [args[0], registry]), [
    ["start", "public.ecr.aws"], ["stop", "public.ecr.aws"], ["start", "ghcr.io"],
  ]);
  assert.deepEqual(f.calls()[1].args, ["stop", "--no-backup", "--workdir", f.directory]);
  assert.equal(f.exported(), "SUPABASE_INTERNAL_IMAGE_REGISTRY=ghcr.io\n");
});

test("a second transient failure preserves its exit code and never starts a third time", async (t) => {
  const f = fixture(t, [{ code: 23, output: transientError }, {}, { code: 42, output: transientError }, {}]);
  assert.equal(await f.run(), 42);
  assert.deepEqual(f.calls().map(({ args }) => args[0]), ["start", "stop", "start", "stop"]);
  assert.equal(f.exported(), "");
});

for (const [name, error] of [
  ["migration", "ERROR: column does not exist (SQLSTATE 42703)"],
  ["config", "failed to parse config: decoding failed"],
  ["unhealthy service", "supabase_auth container is not ready: unhealthy"],
  ["disk", "no space left on device"],
  ["missing image", "manifest unknown"],
]) {
  test(`${name} failure takes precedence over earlier transient image errors`, async (t) => {
    const f = fixture(t, [{ code: 7, output: `${transientError}\n${error}\n` }, {}]);
    assert.equal(await f.run(), 7);
    assert.deepEqual(f.calls().map(({ args }) => args[0]), ["start", "stop"]);
    assert.equal(f.exported(), "");
  });
}

test("database connection timeouts and unknown failures do not retry", async (t) => {
  const f = fixture(t, [{ code: 11, output: "failed to connect to postgres: context deadline exceeded\n" }, {}]);
  assert.equal(await f.run(), 11);
  assert.equal(f.calls().length, 2);
});

test("a registry network timeout allows a fallback", async (t) => {
  const f = fixture(t, [{ code: 1, output: 'failed to resolve reference: Get "https://public.ecr.aws/v2/supabase/postgres/manifests/17": net/http: TLS handshake timeout\n' }, {}, {}]);
  assert.equal(await f.run(), 0);
  assert.equal(f.calls().length, 3);
});

test("Docker image configuration download errors are transient, not invalid CLI config", async (t) => {
  const f = fixture(t, [{ code: 1, output: "error pulling image configuration: download failed after attempts=1: toomanyrequests; error pulling image configuration: download failed: toomanyrequests\n" }, {}, {}]);
  assert.equal(await f.run(), 0);
  assert.equal(f.calls().length, 3);
});

test("startup hang is forcibly killed within the overall budget and cleaned up once", async (t) => {
  const f = fixture(t, [{ hang: true, output: transientError }, {}]);
  const started = performance.now();
  assert.equal(await f.run({ timeoutMs: 4_500, cleanupTimeoutMs: 1_500 }), 124);
  assert.ok(performance.now() - started < 7_000, "hung CLI exceeded its bounded timeout");
  assert.deepEqual(f.calls().map(({ args }) => args[0]), ["start", "stop"]);
  assert.match(f.output(), /timed out/);
  assert.equal(f.exported(), "");
});

test("cleanup failure stops a fallback and preserves the startup failure", async (t) => {
  const f = fixture(t, [{ code: 23, output: transientError }, { code: 17 }]);
  assert.equal(await f.run(), 23);
  assert.equal(f.calls().length, 2);
  assert.match(f.output(), /cleanup failed/);
});

test("a hanging cleanup is also bounded and cannot trigger another start", async (t) => {
  const f = fixture(t, [{ code: 23, output: transientError }, { hang: true }]);
  const started = performance.now();
  assert.equal(await f.run({ timeoutMs: 6_000, cleanupTimeoutMs: 2_000 }), 23);
  assert.ok(performance.now() - started < 7_000, "hung cleanup exceeded its bounded timeout");
  assert.equal(f.calls().length, 2);
});

test("refuses to reset a developer's local stack outside GitHub Actions", async (t) => {
  const f = fixture(t, []);
  assert.equal(await f.run({ env: { GITHUB_ACTIONS: "false" } }), 1);
  assert.deepEqual(f.calls(), []);
});
