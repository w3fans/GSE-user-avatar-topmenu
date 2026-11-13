# GSE User Avatar Top Menu

GNOME Shell extension that shows your avatar and account display name in the top bar.
It can also show the computer name, hardware-style system usage and temperature icons, hover tooltips with usage bars and hardware details, keep the session awake manually or automatically, hide the top bar for fullscreen or maximized windows, and add an optional user tile in quick settings for preferences and session actions.

## Features

Version 0.8.10 keeps metric actors and keyboard focus stable during sampling,
serializes session inhibition, and cancels hardware I/O per enable lifetime.
Metric ordering uses accessible up/down buttons; compact spacing and automatic
physical/bridge endpoint network modes are available in Preferences. Select a
VPN interface explicitly to measure its traffic. Disk totals count physical
whole disks rather than RAID/device-mapper layers and partitions.

Autohide translates the panel without changing Shell's chrome registration or
strut policy. This deliberately retains Shell's reserved panel area; it avoids
taking ownership of another extension's work-area policy. Hover holds reveal
open, and disable restores the panel translation owned by this extension.

Slovenian and Polish core UI catalogs are shipped. Untranslated strings use
English. Run `bash po/compile.sh` (gettext/msgfmt required) after editing PO
files; validation compiles/checks catalogs and packaging includes the MO files.
Public releases can be built from a fresh clone. The maintainer's local personal
builder is optional; when present, the established SU-first publication applies.

Supports GNOME Shell 45–51, including Fedora 45's GNOME 51. The private SU
companion also offers keyboard backlight inactivity presets in Hardware
Preferences; keyboard, touchpad, or mouse activity restores the previous preset.

The **SU companion is publicly downloadable**, despite the historical “private”
name. It is an unsupported personal variant for exact-model Gigabyte G5 GD and
G6 KF hardware and privileged RAM inventory. It requires separately installed
helpers and narrowly scoped sudo rules. Submit only the ordinary public ZIP to
GNOME Extensions. SU-only controls never enter that package.

GNOME 51 has local runtime coverage. Support for 45–50 remains declared, but a
complete physical compatibility matrix has not been run.

- Show avatar and display name in the left side of the top bar
- Circular avatar styling inspired by the login screen
- Optionally show the hostname with a computer icon
- Optional placement after `Apps` and `Places`
- Keep-awake toggle with a visible active-state icon
- Automatic keep-awake for focused fullscreen apps or active MPRIS media playback
- Keep-awake timer presets for 15, 30, 60, and 120 minutes
- Persistent keep-awake deadlines with remaining time and timer actions in both menus
- Quick settings submenu on the top right with the user name, `Open Preferences`, and `Log Out`
- Optional `Show in top bar` toggle so the quick settings entry can stay available on its own
- Optional CPU, memory, swap, iGPU, dGPU, CPU temperature, and GPU temperature columns on the left or right side of the top bar
- Optional aggregate network throughput and physical-disk activity indicators
- Hover tooltips with horizontal usage bars and CPU, RAM, swap, iGPU, and dGPU details
- Keyboard-accessible metric details and an optional GNOME System Monitor action
- Option to use colored metrics or default white panel styling separately for usage and temperatures
- Configurable metric order, GPU selection, temperature thresholds, polling intervals, Celsius/Fahrenheit temperatures, and optional decimal values
- Lock-aware polling and battery-adaptive refresh intervals
- Animated top-edge reveal while top-bar autohide is active
- GNOME 50 / Fedora 44 convenience toggles for primary paste and touchpad middle click
- Preferences diagnostics, reset-to-defaults, author, license, description, and installed version

## Project

- Author: Denis Zvegelj
- License: GNU GPL v3
- Repository: `https://github.com/w3fans/GSE-user-avatar-topmenu`
- Extension UUID: `user-avatar-topmenu@basing.si`

## Install From Source

```bash
git clone https://github.com/w3fans/GSE-user-avatar-topmenu.git
cd GSE-user-avatar-topmenu
./build
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
./build
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

Validate without packaging:

```bash
./validate.sh
```

Release modes:

```bash
./release.sh patch
./release.sh minor
./release.sh beta
./release.sh major
```

`minor` automatically advances to the next even minor stable line. `stable`
remains available as an alias; `beta` advances to the next odd minor line.

`release.sh` will:

- require a matching changelog entry
- bump `VERSION` and the integer metadata version
- run syntax, schema, SVG, unit, review-pattern, and package-content checks
- build the public ZIP from `package-files.txt`
- commit only intended project files
- build and publish the personal passwordless-sudo RAM companion tag first
- verify its GitHub Release asset and retire the previous companion tag
- push `main` and publish the normal tag last

Build versioned ZIP files for GitHub Releases:

Pass every tag explicitly, for example `./build-release-zips.sh v0.7.0`.

That creates archives in `dist/`, for example:

- `dist/user-avatar-topmenu@basing.si-v0.7.0.shell-extension.zip`
- `dist/user-avatar-topmenu@basing.si-v0.7.0.shell-extension.sha256`

## Architecture and Tests

- `extension.js` contains Shell actors and feature controllers.
- `lib/io.js` contains bounded asynchronous subprocess and DBus helpers.
- `lib/logic.js` contains pure parsing, formatting, timer, utilization, and geometry logic.
- `lib/menu.js` owns the shared top-bar/Quick Settings menu construction and synchronization.
- `lib/settings.js` defines shared settings descriptors and testable derived menu state.
- `prefs.js` builds the libadwaita preferences and diagnostics pages.
- `package-files.txt` is the only authoritative public-package manifest.
- `tests/logic.test.js` covers parsers, utilization math, units, timer persistence, and monitor geometry.

The automated suite cannot replace real GNOME Shell testing across every supported release and hardware combination. Before EGO submission, smoke-test enable/disable, Preferences, Quick Settings, autohide, keep-awake, and available sensors on the targeted Shell versions.
