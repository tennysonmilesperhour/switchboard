#!/usr/bin/env bash
set -euo pipefail

# Usage: bash scripts/ci/ensure-disk-space.sh MIN_FREE_GIB
# MIN_FREE_GIB is a positive integer (1-9999). Measure the checkout filesystem,
# which also holds Docker data on GitHub's Ubuntu hosted runners. Only remove
# known unused SDKs when needed; never remove the hosted tool cache (active Node).
if [[ $# -ne 1 || ! $1 =~ ^[1-9][0-9]{0,3}$ ]]; then
  echo "Usage: $0 MIN_FREE_GIB (integer from 1 to 9999)" >&2
  exit 2
fi

required_kib=$(($1 * 1024 * 1024))
workspace=${GITHUB_WORKSPACE:-$PWD}

check_space() {
  if ! available_kib=$(df -Pk -- "$workspace" | awk 'NR == 2 { print $4 }'); then
    echo "Unable to measure free disk space for $workspace." >&2
    exit 1
  fi
  if [[ ! $available_kib =~ ^[0-9]+$ ]]; then
    echo "Unable to determine free disk space for $workspace." >&2
    exit 1
  fi
  echo "Disk space: $available_kib KiB available; $required_kib KiB required ($1 GiB)."
  [[ $available_kib -ge $required_kib ]]
}

if check_space "$1"; then
  echo "Enough disk space; skipping cleanup."
  exit 0
fi

if [[ ${GITHUB_ACTIONS:-} != true || ${RUNNER_OS:-} != Linux ]]; then
  echo "Insufficient disk space. SDK cleanup is only allowed on GitHub Actions Linux runners." >&2
  exit 1
fi

# Fixed allowlist only. In particular, do not expand AGENT_TOOLSDIRECTORY here:
# setup-node and other actions may already be running from the hosted tool cache.
for sdk in /usr/local/lib/android /usr/share/dotnet /opt/ghc /usr/local/share/boost; do
  echo "Removing unused SDK: $sdk"
  sudo rm -rf -- "$sdk"
  if check_space "$1"; then
    echo "Enough disk space; stopping cleanup."
    exit 0
  fi
done

echo "Insufficient disk space after cleaning the allowed SDKs: $available_kib KiB available; $required_kib KiB required. Check runner disk usage before retrying." >&2
exit 1
