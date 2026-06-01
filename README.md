# GSE User Avatar Top Menu

GNOME Shell extension that shows your avatar and username in the top bar.
It can also show the computer name, keep the session awake, hide the top bar for fullscreen or maximized windows, and add an optional user tile in quick settings for preferences and session actions.

## Codex / New Thread Workflow

When starting a new thread on this project, use these steps so the work stays predictable:

1. Work from the project root: `/www/gnome/us_TopMenu` or `/app/gnome/us_TopMenu`.
2. Read `README.md`, `CHANGELOG.md`, `metadata.json`, `schemas/org.gnome.shell.extensions.username-avatar.gschema.xml`, `extension.js`, and `prefs.js` before changing behavior.
3. Keep runtime code in `extension.js`, preferences UI in `prefs.js`, settings keys in the schema XML, and release notes in `CHANGELOG.md`.
4. For every user-facing feature, add or update the matching Preferences control and schema key.
5. Build locally with `gnome-extensions pack --force --out-dir . --extra-source prefs.js --extra-source VERSION --schema schemas/org.gnome.shell.extensions.username-avatar.gschema.xml .`.
6. Release with `./release.sh vX.Y.Z "Release vX.Y.Z"` so `VERSION`, `metadata.json` version, the git tag, and `dist/` ZIP stay aligned.
7. Do not ship generated `schemas/gschemas.compiled` inside release ZIPs.

## Features

- Show avatar and display name in the left side of the top bar
- Circular avatar styling inspired by the login screen
- Optionally show the hostname with a computer icon
- Optional placement after `Apps` and `Places`
- Keep-awake toggle with a visible active-state icon
- Quick settings submenu on the top right with the user name, `Open Preferences`, and `Log Out`
- Optional `Show in top bar` toggle so the quick settings entry can stay available on its own
- Optional CPU, memory, swap, iGPU, dGPU, CPU temperature, and GPU temperature columns on the left or right side of the top bar
- GNOME 50 / Fedora 44 convenience toggles for primary paste and touchpad middle click
- Preferences window with author, license, description, and installed version

## Project

- Author: Denis Zvegelj
- License: GNU GPL v3
- Repository: `https://github.com/w3fans/GSE-user-avatar-topmenu`
- Extension UUID: `user-avatar-topmenu@basing.si`

## Install From Source

```bash
git clone https://github.com/w3fans/GSE-user-avatar-topmenu.git
cd GSE-user-avatar-topmenu
gnome-extensions pack --force --out-dir . --extra-source prefs.js --extra-source VERSION --schema schemas/org.gnome.shell.extensions.username-avatar.gschema.xml .
gnome-extensions install --force ./user-avatar-topmenu@basing.si.shell-extension.zip
gnome-extensions enable user-avatar-topmenu@basing.si
```

Open preferences:

```bash
gnome-extensions prefs user-avatar-topmenu@basing.si
```

## Update Test Build

```bash
git pull
gnome-extensions pack --force --out-dir . --extra-source prefs.js --extra-source VERSION --schema schemas/org.gnome.shell.extensions.username-avatar.gschema.xml .
gnome-extensions install --force ./user-avatar-topmenu@basing.si.shell-extension.zip
gnome-extensions disable user-avatar-topmenu@basing.si
gnome-extensions enable user-avatar-topmenu@basing.si
```

## Development

Project version is stored in `VERSION`.

Create a patch release:

```bash
./release.sh
```

Create a specific release:

```bash
./release.sh v0.2.0 "Release v0.2.0"
```

`release.sh` will:

- bump `VERSION`
- increment `metadata.json` `version`
- rebuild the extension zip
- create a git commit and tag
- push the branch and the tag

Build versioned ZIP files for GitHub Releases:

```bash
./build-release-zips.sh
```

That creates archives in `dist/`, for example:

- `dist/user-avatar-topmenu@basing.si-v0.2.0.shell-extension.zip`
- `dist/user-avatar-topmenu@basing.si-v0.2.1.shell-extension.zip`
- `dist/user-avatar-topmenu@basing.si-v0.2.2.shell-extension.zip`
