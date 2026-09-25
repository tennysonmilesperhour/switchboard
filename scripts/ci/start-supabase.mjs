import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EXCLUDED_SERVICES = "studio,logflare,vector,imgproxy,edge-runtime";
const REGISTRIES = ["public.ecr.aws", "ghcr.io"];

// Only an explicit image-download failure warrants switching mirrors. A local
// database connection error or an unhealthy service needs diagnosis, not a retry.
function isTransientImageFailure(output) {
  const deterministic = [
    /SQLSTATE|syntax error/i,
    /(?:failed|error) (?:to )?(?:apply|applying|run|running) (?:a )?(?:migration|seed)/i,
    /(?:invalid|failed to (?:read|parse|decode)) config|config(?:uration)? (?:is|was) invalid|config\.toml.*(?:invalid|error)/i,
    /no space left on device|permission denied|manifest unknown|manifest.*not found|unauthorized|denied:|bind: address already in use/i,
    /unhealthy|health check.*fail|failed to connect to (?:postgres|database|db)/i,
  ];
  const imageFailure = /failed to pull|error pulling image|failed to resolve (?:reference|source)|(?:public\.ecr\.aws|ghcr\.io)\//i;
  const transient = /toomanyrequests|too many requests|\b429\b|\b50[234]\b|TLS handshake timeout|i\/o timeout|connection reset by peer|temporary failure in name resolution|temporary network|unexpected EOF|context deadline exceeded|Client\.Timeout exceeded/i;
  return !deterministic.some((pattern) => pattern.test(output)) && imageFailure.test(output) && transient.test(output);
}

function runCommand(command, args, { cwd, env, timeoutMs, killGraceMs, write }) {
  return new Promise((resolveResult) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      // A timed-out Docker child must not survive the CLI. CI runs on Linux.
      detached: process.platform !== "win32",
    });
    let output = "";
    let timedOut = false;
    const capture = (chunk) => {
      output += chunk.toString();
      write(chunk.toString());
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    const kill = (signal) => {
      try {
        if (process.platform === "win32") child.kill(signal);
        else if (child.pid) process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== "ESRCH") write(`Could not signal Supabase: ${error.message}\n`);
      }
    };
    // The grace period is inside the command's budget, not extra runner time.
    const terminateTimer = setTimeout(() => {
      timedOut = true;
      kill("SIGTERM");
    }, Math.max(1, timeoutMs - Math.min(killGraceMs, timeoutMs / 2)));
    const killTimer = setTimeout(() => {
      timedOut = true;
      kill("SIGKILL");
    }, timeoutMs);
    child.on("error", (error) => capture(`Unable to run ${command}: ${error.message}\n`));
    child.on("close", (code, signal) => {
      clearTimeout(terminateTimer);
      clearTimeout(killTimer);
      resolveResult({ code: timedOut ? 124 : (code ?? (signal === "SIGINT" ? 130 : 1)), output, timedOut });
    });
  });
}

// Options keep the real subprocess/timeout behavior testable with a fake CLI.
export async function startSupabase({
  cwd = process.cwd(),
  env = process.env,
  command = "supabase",
  timeoutMs = 300_000,
  cleanupTimeoutMs = 15_000,
  killGraceMs = 1_000,
  write = (text) => process.stdout.write(text),
} = {}) {
  if (env.GITHUB_ACTIONS !== "true") {
    write("::error::This helper resets the current CI project's local data and may only run in GitHub Actions. Use supabase start for development.\n");
    return 1;
  }
  const deadline = performance.now() + timeoutMs;
  const remaining = () => Math.max(0, Math.floor(deadline - performance.now()));
  const cleanup = async (registry) => {
    const budget = Math.min(cleanupTimeoutMs, remaining());
    if (budget <= 0) return false;
    const result = await runCommand(command, ["stop", "--no-backup", "--workdir", cwd], {
      cwd,
      env: { ...env, SUPABASE_INTERNAL_IMAGE_REGISTRY: registry },
      timeoutMs: budget,
      killGraceMs,
      write,
    });
    if (result.code !== 0) write("::warning::Local Supabase cleanup failed or timed out; no further startup will be attempted.\n");
    return result.code === 0;
  };

  for (const [index, registry] of REGISTRIES.entries()) {
    // Reserve time for current-project cleanup even when start hangs.
    const budget = remaining() - cleanupTimeoutMs;
    if (budget <= 0) {
      write("::error::Supabase startup exhausted its total time budget.\n");
      return 124;
    }
    write(`Starting local Supabase from ${registry} (attempt ${index + 1}/${REGISTRIES.length}, ${Math.ceil(budget / 1000)}s available).\n`);
    const result = await runCommand(command, ["start", "-x", EXCLUDED_SERVICES, "--workdir", cwd], {
      cwd,
      env: { ...env, SUPABASE_INTERNAL_IMAGE_REGISTRY: registry },
      timeoutMs: budget,
      killGraceMs,
      write,
    });
    if (result.code === 0) {
      if (env.GITHUB_ENV) appendFileSync(env.GITHUB_ENV, `SUPABASE_INTERNAL_IMAGE_REGISTRY=${registry}\n`);
      return 0;
    }

    const mayRetry = index === 0 && !result.timedOut && isTransientImageFailure(result.output);
    if (result.timedOut) write("::error::Supabase startup timed out; stopping this local stack without retrying.\n");
    else if (mayRetry) write("::warning::Image download failed transiently; trying the alternate registry once after local cleanup.\n");
    else write(`::error::Supabase startup failed (exit ${result.code}); no further retry. Inspect the CLI error above.\n`);

    const cleaned = await cleanup(registry);
    if (!mayRetry || !cleaned) return result.code;
  }
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = await startSupabase();
  } catch (error) {
    console.error(`::error::Supabase startup helper failed: ${error.message}`);
    process.exitCode = 1;
  }
}
