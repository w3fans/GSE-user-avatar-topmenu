#!/usr/bin/env bash
set -euo pipefail

inc="${1:-0.0.1}"
msg="${2:-}"

if [[ "$inc" == "-h" || "$inc" == "--help" ]]; then
  cat <<'EOF'
Usage: ./release.sh [0.0.1|0.1.0|1.0.0|vX.Y.Z] ["tag message"]

Defaults:
  increment   0.0.1
  tag message Release vX.Y.Z
EOF
  exit 0
fi

git rev-parse --is-inside-work-tree >/dev/null

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required"
  exit 1
fi

if ! command -v gnome-extensions >/dev/null 2>&1; then
  echo "gnome-extensions is required"
  exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Missing git remote 'origin'"
  exit 1
fi

if ! git rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1; then
  git push --set-upstream origin "$branch"
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree is not clean. Commit or stash changes first."
  exit 1
fi

version_file="VERSION"
metadata_file="metadata.json"
schema_dir="schemas"
schema_xml="${schema_dir}/org.gnome.shell.extensions.username-avatar.gschema.xml"

if [[ ! -f "$version_file" || ! -f "$metadata_file" || ! -f "$schema_xml" ]]; then
  echo "Missing required release files"
  exit 1
fi

current="$(tr -d '[:space:]' < "$version_file")"
IFS='.' read -r major minor patch <<< "$current"

if [[ -z "${major:-}" || -z "${minor:-}" || -z "${patch:-}" ]]; then
  echo "Invalid VERSION value: $current"
  exit 1
fi

if [[ "$inc" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  next="${inc#v}"
elif [[ "$inc" == "0.0.1" ]]; then
  next="${major}.${minor}.$((patch + 1))"
elif [[ "$inc" == "0.1.0" ]]; then
  next="${major}.$((minor + 1)).0"
elif [[ "$inc" == "1.0.0" ]]; then
  next="$((major + 1)).0.0"
else
  echo "Unsupported increment: $inc"
  exit 1
fi

tag="v${next}"

if git rev-parse "$tag" >/dev/null 2>&1; then
  echo "Tag already exists: $tag"
  exit 1
fi

if [[ -z "$msg" ]]; then
  msg="Release ${tag}"
fi

uuid="$(python3 - <<'PY'
import json
from pathlib import Path
data = json.loads(Path("metadata.json").read_text())
print(data["uuid"])
PY
)"
bundle="${uuid}.shell-extension.zip"

metadata_version_before="$(python3 - <<'PY'
import json
from pathlib import Path
data = json.loads(Path("metadata.json").read_text())
print(int(data.get("version", 0)))
PY
)"
metadata_version_after=$((metadata_version_before + 1))

printf '%s\n' "$next" > "$version_file"

NEXT_VERSION="$next" METADATA_VERSION="$metadata_version_after" python3 - <<'PY'
import json
import os
from pathlib import Path

path = Path("metadata.json")
data = json.loads(path.read_text())
data["version"] = int(os.environ["METADATA_VERSION"])
path.write_text(json.dumps(data, indent=2) + "\n")
PY

glib-compile-schemas "$schema_dir"
rm -f "$bundle"
gnome-extensions pack --force --out-dir . --extra-source prefs.js --extra-source VERSION --schema "$schema_xml" .

git add "$version_file" "$metadata_file" "$schema_xml"
git add prefs.js extension.js stylesheet.css README.md CHANGELOG.md .gitignore

git commit -m "chore(release): ${tag}"

mkdir -p dist
cp "$bundle" "dist/${uuid}-${tag}.shell-extension.zip"

git tag -a "$tag" -m "$msg"
git push
git push origin "$tag"

echo "Released ${tag}"
echo "VERSION: ${current} -> ${next}"
echo "metadata version: ${metadata_version_before} -> ${metadata_version_after}"
echo "Release zip: dist/${uuid}-${tag}.shell-extension.zip"
