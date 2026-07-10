#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$repo_root"

node --check extension.js
node --check prefs.js
for file in lib/*.js; do
    node --check "$file"
done
glib-compile-schemas --strict --dry-run schemas
bash -n build release.sh build-release-zips.sh validate.sh ego-check.sh po/update-pot.sh
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git diff --check
fi

for file in metric-*-symbolic.svg; do
    xmllint --noout "$file"
done

while IFS= read -r file; do
    [[ -z "$file" || "$file" == \#* ]] && continue
    [[ -f "$file" ]] || {
        echo "Package manifest entry does not exist: $file" >&2
        exit 1
    }
done < package-files.txt

if [[ -d tests ]]; then
    node --test tests/*.test.js
fi

if rg -n "disableExtension|Util\.spawn|sudo|pkexec|gnome-extensions|gschemas\.compiled" \
    extension.js prefs.js schemas; then
    echo "Public runtime contains a forbidden review pattern" >&2
    exit 1
fi

echo "Validation passed"
