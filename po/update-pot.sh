#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

xgettext \
    --language=JavaScript \
    --keyword=_ \
    --keyword=translate \
    --keyword=gettext \
    --keyword=_addBoundSwitch:4 \
    --keyword=_addBoundSwitch:5 \
    --keyword=_addPollingIntervalRow:4 \
    --keyword=_addPollingIntervalRow:5 \
    --keyword=_addDeviceRow:4 \
    --from-code=UTF-8 \
    --package-name=user-avatar-topmenu \
    --package-version="$(tr -d '[:space:]' < VERSION)" \
    --copyright-holder='Denis Zvegelj' \
    --files-from=po/POTFILES.in \
    --output=po/user-avatar-topmenu.pot
