#!/usr/bin/env bash
set -euo pipefail

mode="${1:-patch}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$repo_root"

if [[ "$mode" == "-h" || "$mode" == "--help" ]]; then
    cat <<'EOF'
Usage: ./release.sh [patch|beta|stable|major|vX.Y.Z]

patch   Increment the patch number on the current release line.
beta    Start the next odd minor release line.
stable  Start the next even minor release line.
major   Start the next major release line.
vX.Y.Z  Deliberate recovery override.

The script validates and commits the public release, publishes and verifies the
matching personal vX.Y.Zsu tag first, removes the preceding su tag, then pushes
main and publishes vX.Y.Z last.
EOF
    exit 0
fi

for command in git node zip unzip curl xgettext; do
    command -v "$command" >/dev/null || {
        echo "$command is required" >&2
        exit 1
    }
done

[[ "$(git branch --show-current)" == "main" ]] || {
    echo "Releases must start from main" >&2
    exit 1
}
git diff --cached --quiet || {
    echo "The index already contains staged changes" >&2
    exit 1
}

current="$(tr -d '[:space:]' < VERSION)"
IFS='.' read -r major minor patch <<< "$current"
[[ "$major" =~ ^[0-9]+$ && "$minor" =~ ^[0-9]+$ && "$patch" =~ ^[0-9]+$ ]] || {
    echo "Invalid VERSION: $current" >&2
    exit 1
}

case "$mode" in
patch) next="${major}.${minor}.$((patch + 1))" ;;
beta)
    next_minor=$((minor + 1))
    (( next_minor % 2 == 1 )) || next_minor=$((next_minor + 1))
    next="${major}.${next_minor}.0"
    ;;
stable)
    next_minor=$((minor + 1))
    (( next_minor % 2 == 0 )) || next_minor=$((next_minor + 1))
    next="${major}.${next_minor}.0"
    ;;
major) next="$((major + 1)).0.0" ;;
v[0-9]*.[0-9]*.[0-9]*) next="${mode#v}" ;;
*) echo "Unknown release mode: $mode" >&2; exit 2 ;;
esac

tag="v${next}"
su_tag="${tag}su"
git rev-parse -q --verify "refs/tags/$tag" >/dev/null && {
    echo "Tag already exists: $tag" >&2
    exit 1
}
git rev-parse -q --verify "refs/tags/$su_tag" >/dev/null && {
    echo "Tag already exists: $su_tag" >&2
    exit 1
}
grep -Fq "## ${next}" CHANGELOG.md || {
    echo "Add a '## ${next}' entry to CHANGELOG.md before releasing" >&2
    exit 1
}

printf '%s\n' "$next" > VERSION
NEXT_VERSION="$next" node --input-type=module <<'NODE'
import fs from 'node:fs';
const metadata = JSON.parse(fs.readFileSync('metadata.json'));
metadata.version = Number(metadata.version ?? 0) + 1;
fs.writeFileSync('metadata.json', `${JSON.stringify(metadata, null, 2)}\n`);
NODE

chmod +x po/update-pot.sh
po/update-pot.sh

./build

git add \
    .github/workflows/release.yml \
    CHANGELOG.md README.md TESTING.md VERSION metadata.json extension.js prefs.js stylesheet.css \
    schemas package-files.txt package.json lib po tests \
    build validate.sh ego-check.sh build-release-zips.sh release.sh \
    metric-*-symbolic.svg
git commit -m "Release ${tag}"

chmod +x .codex/build-personal-ram.sh
.codex/build-personal-ram.sh
uuid="$(node -p "JSON.parse(require('fs').readFileSync('metadata.json')).uuid")"
personal_zip="dist/${uuid}-${su_tag}.shell-extension.zip"
[[ -f "$personal_zip" ]] || {
    echo "Personal artifact missing: $personal_zip" >&2
    exit 1
}

worktree="$(mktemp -d)"
cleanup() {
    git worktree remove --force "$worktree" >/dev/null 2>&1 || true
    rm -rf "$worktree"
}
trap cleanup EXIT
git worktree add --detach "$worktree" HEAD
(
    cd "$worktree"
    sed -i \
        "s/runCommandAsync(\['dmidecode', '--type', '17'\]/runCommandAsync(['sudo', '-n', 'dmidecode', '--type', '17']/" \
        extension.js
    printf '%ssu\n' "$next" > VERSION
    cp "$repo_root/$personal_zip" "${uuid}-${su_tag}.shell-extension.zip"
    git add extension.js VERSION
    git add -f "${uuid}-${su_tag}.shell-extension.zip"
    git commit -m "Release ${su_tag}"
    git tag -a "$su_tag" -m "Release ${su_tag}"
    GIT_SSH_COMMAND='ssh -p 443 -o Hostname=ssh.github.com' git push origin "$su_tag"
)

wait_for_release_asset() {
    local release_tag="$1"
    local asset="${uuid}-${release_tag}.shell-extension.zip"
    local url="https://api.github.com/repos/w3fans/GSE-user-avatar-topmenu/releases/tags/${release_tag}"
    for _attempt in $(seq 1 30); do
        local payload=""
        payload="$(curl --fail --silent "$url" || true)"
        if grep -Fq "$asset" <<< "$payload"; then
            return 0
        fi
        sleep 10
    done
    echo "GitHub Release asset was not verified for $release_tag" >&2
    return 1
}

wait_for_release_asset "$su_tag"

previous_su="$(git tag --list 'v*su' --sort=-version:refname | grep -Fxv "$su_tag" | head -n1 || true)"
if [[ -n "$previous_su" ]]; then
    GIT_SSH_COMMAND='ssh -p 443 -o Hostname=ssh.github.com' \
        git push origin ":refs/tags/${previous_su}" || true
    git tag -d "$previous_su"
fi

git tag -a "$tag" -m "Release ${tag}"
GIT_SSH_COMMAND='ssh -p 443 -o Hostname=ssh.github.com' git push origin main
GIT_SSH_COMMAND='ssh -p 443 -o Hostname=ssh.github.com' git push origin "$tag"
wait_for_release_asset "$tag"

echo "Released $su_tag followed by $tag"
