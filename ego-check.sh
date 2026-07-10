#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$repo_root"

version="$(tr -d '[:space:]' < VERSION)"
uuid="$(node -p "JSON.parse(require('fs').readFileSync('metadata.json')).uuid")"
artifact="dist/${uuid}-v${version}.shell-extension.zip"

./build
[[ "$version" != *su ]] || {
    echo "EGO packages must never use a personal su version" >&2
    exit 1
}

contents="$(unzip -Z1 "$artifact")"
if grep -Eq 'gschemas\.compiled|(^|/)(\.codex|dist|tests?|po|build|release\.sh)(/|$)' <<< "$contents"; then
    echo "EGO artifact contains a forbidden file" >&2
    exit 1
fi
if unzip -p "$artifact" extension.js | rg -n 'sudo|pkexec|disableExtension|Util\.spawn'; then
    echo "EGO runtime contains a forbidden review pattern" >&2
    exit 1
fi

echo "EGO preflight passed: $artifact"
echo "Manual authenticated submission: https://extensions.gnome.org/upload/"
