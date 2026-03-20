# Changelog

## 0.2.4

- Made the top-bar hostname mode more compact by using the computer icon without adding a long extra text segment
- Moved the avatar rendering toward a circular, login-style presentation
- Added a keep-awake switch to the user submenu in the top-right menu
- Kept the top bar hidden when `Show in top bar` is disabled while preserving the user submenu

## 0.2.3

- Expanded declared GNOME Shell compatibility to versions 45 through 49
- Added a helper script to build versioned ZIP assets for GitHub Releases

## 0.2.2

- Added circular avatar styling in the top bar
- Replaced the textual `at` hostname join with a computer icon plus hostname label
- Added a `Show in top bar` toggle to hide the panel item while keeping the quick settings entry
- Kept the quick settings submenu label compact by showing just the user name

## 0.2.1

- Added a top-right quick settings submenu with the user name
- Added `Open Preferences` and `Log Out` actions to that submenu
- Expanded the preferences About section with author, license, description, and version
- Reworked the README with clearer install, update, and project information

## 0.2.0

- Added keep-awake support to block the screen saver
- Added a visible active-state icon while keep-awake is enabled
- Added an option to place the panel item after `Apps` and `Places`
- Added installed-version display in Preferences

## 0.0.6

- Added installed-version display in Preferences

## 0.0.5

- Fixed GObject panel button initialization by switching to `_init(...)`

## 0.0.4

- Registered the panel button subclass with `GObject.registerClass(...)`

## 0.0.3

- Fixed preferences binding to use `Gio.SettingsBindFlags`

## 0.0.2

- Switched to the publishable UUID `user-avatar-topmenu@basing.si`

## 0.0.1

- Initial public version of the extension
