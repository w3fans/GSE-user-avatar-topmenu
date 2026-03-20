# GSE User Avatar Top Menu

GNOME Shell extension that shows the current account avatar and display name in the top bar.
It can optionally append the computer name, keep the session awake, and add a quick shortcut in the top-right menu for preferences and log out.

## Features

- Show avatar and display name in the left side of the top bar
- Circular avatar styling inspired by the login screen
- Optionally show the hostname with a computer icon
- Optional placement after `Apps` and `Places`
- Keep-awake toggle with a visible active-state icon
- Quick settings submenu on the top right with the user name, `Open Preferences`, and `Log Out`
- Optional `Show in top bar` toggle so the quick settings entry can stay available on its own
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
