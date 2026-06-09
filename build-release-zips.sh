#!/usr/bin/env bash
set -euo pipefail

if ! command -v gnome-extensions >/dev/null 2>&1; then
  echo "gnome-extensions is required"
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required"
  exit 1
fi

git rev-parse --is-inside-work-tree >/dev/null
repo_root="$(pwd)"

mkdir -p "${repo_root}/dist"

if [[ $# -eq 0 ]]; then
  set -- v0.2.7
#  set -- v0.2.0 v0.2.1 v0.2.2 v0.2.3 v0.2.4 v0.2.5 v0.2.6 v0.2.7
fi

tmp_root="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_root"
}
trap cleanup EXIT

for tag in "$@"; do
  workdir="${tmp_root}/${tag}"
  uuid=""
  git archive "$tag" | tar -x -C "$workdir" 2>/dev/null || {
    mkdir -p "$workdir"
    git archive "$tag" | tar -x -C "$workdir"
  }

  (
    cd "$workdir"
    gnome-extensions pack \
      --force \
      --out-dir . \
      --extra-source prefs.js \
      --extra-source VERSION \
      --schema schemas/org.gnome.shell.extensions.username-avatar.gschema.xml \
      .

    uuid="$(python3 - <<'PY'
import json
from pathlib import Path
data = json.loads(Path("metadata.json").read_text())
print(data["uuid"])
PY
)"

    cp "${uuid}.shell-extension.zip" "${repo_root}/dist/${uuid}-${tag}.shell-extension.zip"
    printf '%s\n' "$uuid" > .built-uuid
  )

  uuid="$(cat "${workdir}/.built-uuid")"
  echo "Built dist/${uuid}-${tag}.shell-extension.zip"
done
