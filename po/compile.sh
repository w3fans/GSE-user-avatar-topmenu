#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v msgfmt >/dev/null || { echo 'msgfmt is required' >&2; exit 1; }
for language in sl pl; do
    mkdir -p "locale/$language/LC_MESSAGES"
    msgfmt --check "po/$language.po" -o "locale/$language/LC_MESSAGES/user-avatar-topmenu.mo"
done
