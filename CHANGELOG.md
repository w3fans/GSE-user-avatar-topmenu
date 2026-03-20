# Changelog

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
