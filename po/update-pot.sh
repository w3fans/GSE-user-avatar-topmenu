#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

node po/extract-source-strings.js
xgettext \
    --language=JavaScript \
    --keyword=_ \
    --keyword=translate \
    --from-code=UTF-8 \
    --package-name=user-avatar-topmenu \
    --package-version="$(tr -d '[:space:]' < VERSION)" \
    --copyright-holder='Denis Zvegelj' \
    --files-from=po/POTFILES.in \
    --output=po/user-avatar-topmenu.pot
