# GSE User Avatar Top Menu

GNOME Shell extension that shows your avatar and username in the top bar.
It can also show the computer name, keep the session awake, hide the top bar for fullscreen or maximized windows, and add an optional user tile in quick settings for preferences and session actions.

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
gnome-extensions pack --force --out-dir . \
  --extra-source prefs.js \
  --extra-source VERSION \
  --extra-source icons/cpu-symbolic.svg \
  --extra-source icons/memory-symbolic.svg \
  --extra-source icons/swap-symbolic.svg \
  --extra-source icons/igpu-symbolic.svg \
  --extra-source icons/dgpu-symbolic.svg \
  --schema schemas/org.gnome.shell.extensions.username-avatar.gschema.xml .
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
gnome-extensions pack --force --out-dir . \
  --extra-source prefs.js \
  --extra-source VERSION \
  --extra-source icons/cpu-symbolic.svg \
  --extra-source icons/memory-symbolic.svg \
  --extra-source icons/swap-symbolic.svg \
  --extra-source icons/igpu-symbolic.svg \
  --extra-source icons/dgpu-symbolic.svg \
  --schema schemas/org.gnome.shell.extensions.username-avatar.gschema.xml .
gnome-extensions install --force ./user-avatar-topmenu@basing.si.shell-extension.zip
gnome-extensions disable user-avatar-topmenu@basing.si
gnome-extensions enable user-avatar-topmenu@basing.si
```

## Development

Project version is stored in `VERSION`.

Release version convention:

- Even minor versions such as `0.4.x` and `0.6.x` are stable releases.
- Odd minor versions such as `0.5.x` and `0.7.x` are beta/development releases.
- Patch versions contain compatible fixes and refinements within the same release line.

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
