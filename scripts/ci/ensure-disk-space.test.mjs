import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./ensure-disk-space.sh", import.meta.url));
const gib = 1024 * 1024;
const allowedSdks = [
  "/usr/local/lib/android",
  "/usr/share/dotnet",
  "/opt/ghc",
  "/usr/local/share/boost",
];

function runCleanup(t, { freeGiB, args = ["12"], env = {} }) {
  const directory = mkdtempSync(join(tmpdir(), "switchboard-ci-disk-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const freeSpace = join(directory, "free-space");
  const removals = join(directory, "removals");
  writeFileSync(freeSpace, freeGiB.map((value) => value * gib).join("\n") + "\n");
  writeFileSync(removals, "");

  // All deletion commands are intercepted. The fake sudo never invokes rm;
  // only this test's temporary fixture directory is removed by t.after.
  writeFileSync(join(directory, "sudo"), `#!/bin/bash
printf '%s\\n' "$*" >> "$DISK_TEST_REMOVALS"
`, { mode: 0o755 });
  // Also intercept an accidental direct rm call in future versions of the script.
  writeFileSync(join(directory, "rm"), `#!/bin/bash
printf '%s\\n' "rm $*" >> "$DISK_TEST_REMOVALS"
`, { mode: 0o755 });
  writeFileSync(join(directory, "df"), `#!/bin/bash
IFS= read -r available < "$DISK_TEST_FREE_SPACE"
printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\\n'
printf '/dev/fake 999999999 0 %s 0%% /\\n' "$available"
tail -n +2 "$DISK_TEST_FREE_SPACE" > "$DISK_TEST_FREE_SPACE.next"
mv "$DISK_TEST_FREE_SPACE.next" "$DISK_TEST_FREE_SPACE"
exit "\${DISK_TEST_DF_STATUS:-0}"
`, { mode: 0o755 });

  const result = spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${directory}:/usr/bin:/bin`,
      GITHUB_ACTIONS: "true",
      RUNNER_OS: "Linux",
      GITHUB_WORKSPACE: directory,
      AGENT_TOOLSDIRECTORY: "/must-not-remove-active-node",
      DISK_TEST_FREE_SPACE: freeSpace,
      DISK_TEST_REMOVALS: removals,
      ...env,
    },
  });
  return {
    ...result,
    removals: readFileSync(removals, "utf8").trim().split("\n").filter(Boolean),
  };
}

test("skips all cleanup when the requested free space is available", (t) => {
  const result = runCleanup(t, { freeGiB: [12] });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.removals, []);
  assert.match(result.stdout, /skipping cleanup/);
});

test("stops deleting as soon as the threshold is met", (t) => {
  const result = runCleanup(t, { freeGiB: [3, 8, 12] });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.removals, allowedSdks.slice(0, 2).map((sdk) => `rm -rf -- ${sdk}`));
  assert.match(result.stdout, /stopping cleanup/);
});

test("fails after the fixed allowlist is exhausted without touching the tool cache", (t) => {
  const result = runCleanup(t, { freeGiB: [1, 2, 3, 4, 5] });
  assert.equal(result.status, 1);
  assert.deepEqual(result.removals, allowedSdks.map((sdk) => `rm -rf -- ${sdk}`));
  assert.match(result.stderr, /Insufficient disk space after cleaning the allowed SDKs/);
  assert.doesNotMatch(result.removals.join("\n"), /must-not-remove-active-node|hostedtoolcache/);
});

test("honors a different minimum for lighter jobs", (t) => {
  const result = runCleanup(t, { freeGiB: [8], args: ["8"] });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.removals, []);
});

test("refuses cleanup when the disk measurement fails", (t) => {
  const result = runCleanup(t, { freeGiB: [1], env: { DISK_TEST_DF_STATUS: "1" } });
  assert.equal(result.status, 1);
  assert.deepEqual(result.removals, []);
  assert.match(result.stderr, /Unable to measure free disk space/);
});

test("refuses cleanup when free disk space cannot be parsed", (t) => {
  const result = runCleanup(t, { freeGiB: [Number.NaN] });
  assert.equal(result.status, 1);
  assert.deepEqual(result.removals, []);
  assert.match(result.stderr, /Unable to determine free disk space/);
});

for (const env of [
  { GITHUB_ACTIONS: "false" },
  { GITHUB_ACTIONS: "" },
  { RUNNER_OS: "macOS" },
  { RUNNER_OS: "" },
]) {
  test(`refuses deletion outside a GitHub Actions Linux runner: ${JSON.stringify(env)}`, (t) => {
    const result = runCleanup(t, { freeGiB: [1], env });
    assert.equal(result.status, 1);
    assert.deepEqual(result.removals, []);
    assert.match(result.stderr, /only allowed on GitHub Actions Linux runners/);
  });
}

for (const args of [[], ["0"], ["-1"], ["1.5"], ["abc"], ["10000"], ["12", "/tmp"]]) {
  test(`rejects invalid minimum/extra arguments: ${JSON.stringify(args)}`, (t) => {
    const result = runCleanup(t, { freeGiB: [1], args });
    assert.equal(result.status, 2);
    assert.deepEqual(result.removals, []);
    assert.match(result.stderr, /Usage:/);
  });
}
