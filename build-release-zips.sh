#!/usr/bin/env bash
set -euo pipefail

if ! command -v git >/dev/null 2>&1; then
  echo "git is required"
  exit 1
fi

git rev-parse --is-inside-work-tree >/dev/null
repo_root="$(pwd)"

mkdir -p "${repo_root}/dist"

if [[ $# -eq 0 ]]; then
  echo "Usage: ./build-release-zips.sh TAG [TAG ...]" >&2
  exit 2
fi

tmp_root="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_root"
}
trap cleanup EXIT

for tag in "$@"; do
  workdir="${tmp_root}/${tag}"
  uuid=""
  mkdir -p "$workdir"
  git archive "$tag" | tar -x -C "$workdir"

  (
    cd "$workdir"
    if [[ -f build && -f package-files.txt ]]; then
      chmod +x build validate.sh
      ./build
    else
      command -v gnome-extensions >/dev/null || {
        echo "gnome-extensions is required for legacy tag $tag" >&2
        exit 1
      }
      extras=()
      for file in prefs.js VERSION metric-*-symbolic.svg; do
        [[ -f "$file" ]] && extras+=(--extra-source "$file")
      done
      gnome-extensions pack --force --out-dir . "${extras[@]}" .
    fi

    uuid="$(python3 - <<'PY'
import json
from pathlib import Path
data = json.loads(Path("metadata.json").read_text())
print(data["uuid"])
PY
)"

    if [[ -f "dist/${uuid}-${tag}.shell-extension.zip" ]]; then
      cp "dist/${uuid}-${tag}.shell-extension.zip" "${repo_root}/dist/${uuid}-${tag}.shell-extension.zip"
      cp "dist/${uuid}-${tag}.shell-extension.sha256" "${repo_root}/dist/${uuid}-${tag}.shell-extension.sha256"
    else
      cp "${uuid}.shell-extension.zip" "${repo_root}/dist/${uuid}-${tag}.shell-extension.zip"
      sha256sum "${repo_root}/dist/${uuid}-${tag}.shell-extension.zip" \
        > "${repo_root}/dist/${uuid}-${tag}.shell-extension.sha256"
    fi
    printf '%s\n' "$uuid" > .built-uuid
  )

  uuid="$(cat "${workdir}/.built-uuid")"
  echo "Built dist/${uuid}-${tag}.shell-extension.zip"
done
