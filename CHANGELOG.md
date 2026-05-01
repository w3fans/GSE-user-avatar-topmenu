# Changelog

## 0.4.6

- Expanded the extension description to mention restoring middle-click paste, primary selection copy, and three-finger middle click for GNOME 50 and Fedora 44 users

## 0.4.5

- Added the Fedora 44 desktop convenience toggles to both extension menus, not only Preferences
- Grouped menu settings into cascading submenus for Display, Desktop, Autohide, and Extension behavior so the RHS menu stays manageable

## 0.4.4

- Added GNOME Shell 50 to the supported extension versions for Fedora 44 and GNOME 50.1 systems
- Expanded the extension description in metadata and Preferences to better reflect the current feature set
- Added desktop convenience switches in Preferences for primary selection paste and three-finger middle click on touchpads

## 0.4.3

- Added separate options for displaying the username and avatar in the top bar, so each element can be shown or hidden independently
- Mirrored those new display toggles into the extension menus for quick access
- Kept the panel label readable by falling back to the hostname or username when one of the top-bar text elements is hidden

## 0.4.2

- Renamed the quick-settings click preference and menu switches so the disable-extension behavior is exposed directly as a positive option
- Kept the same underlying behavior: when that option is off, clicking the username tile hides only the top-bar entry

## 0.4.1

- Switched the right-side username tile to handle its main click action directly, so it can reliably hide the top-bar item or disable the extension based on the selected preference
- Limited maximized and top-edge autohide checks to the primary monitor, matching the intended top-bar behavior in multi-monitor setups
- Kept fullscreen autohide primary-monitor-only by default, with the separate all-monitors option still available
## 0.4.0

- Added a preference for what clicking the right-side username tile should do: hide only the top-bar item or disable the whole extension
- Mirrored that quick-settings click mode into the extension menus for easier switching
- Kept fullscreen autohide limited to the focused fullscreen window, with a separate option for applying it on all monitors

## 0.2.32

- Made the right-side username quick-settings tile follow its checked state more reliably when toggling top-bar visibility
- Added an option to limit fullscreen autohide to the primary monitor or apply it on all monitors
- Added a disable action in the Preferences window

## 0.2.31

- Fixed duplicate right-side quick settings username entries by properly destroying the quick settings tile on disable/re-enable

## 0.2.30

- Prevented duplicate quick settings username entries by always clearing any existing RHS tile before adding a new one

## 0.2.29

- Fixed GitHub release packaging so compiled GSettings schemas are no longer shipped in release artifacts

## 0.2.28

- Added GitHub Actions automation to create GitHub Releases and upload the built extension ZIP for future tags

## 0.2.27

- Limited fullscreen autohide to the focused fullscreen window so background fullscreen windows and other monitors no longer hide the top bar
- Updated the project description text for the published listing and built-in metadata

## 0.2.26

- Added a separate preference for showing or hiding the right-side quick settings username tile
- Mirrored that quick-settings visibility toggle in the left menu and quick-settings submenu

## 0.2.25

- Reworked panel autohide to release and restore GNOME's reserved top-bar space instead of only hiding the actor

## 0.2.24

- Updated the support link to the final per-extension donation page under `/bs/`

## 0.2.23

- Replaced the placeholder support link with the live idz.si donation page for Basing development

## 0.2.22

- Split top-bar autohide into separate fullscreen, maximized, and top-edge triggers on a dedicated Preferences page
- Added an About-page support section with a donation link for further development

## 0.2.21

- Extended top-bar auto-hide so it also triggers for the focused maximized window, not only true fullscreen
- Added a dedicated auto-hide status icon in the panel while that mode is enabled

## 0.2.20

- Added an option to hide the GNOME top bar whenever a fullscreen app is active
- Exposed the fullscreen auto-hide toggle in Preferences and in both extension menus

## 0.2.19

- Replaced the right-side popup row with a native quick-settings toggle
- Made the right-side item click toggle the top-bar entry, while the submenu opens from the arrow like GNOME's built-in toggles
- Switched the right-side enabled and disabled styling over to GNOME's own quick-settings colors

## 0.2.18

- Added the remaining top-bar spacing between avatar and name, and between the computer icon and hostname
- Added `Lock Screen` to the left user menu as well as the right-side submenu
- Switched the right-side active state from text color to a highlighted background

## 0.2.17

- Added safer spacing between the name, computer indicator, and keep-awake icon in the top bar
- Added a `Lock Screen` action to the right-side user submenu

## 0.2.16

- Restored the computer icon with hostname text using only plain GNOME actor properties
- Kept the top-bar presentation on the simpler, CSS-free baseline
- Highlighted the right-side user submenu label and icon when the top-bar item is enabled

## 0.2.15

- Reverted the top-bar computer indicator back to plain text hostname display
- Restored the simpler `name at hostname` layout as the stable baseline for release

## 0.2.14

- Replaced the custom avatar background-image rendering with a standard file-backed icon to avoid GNOME Shell CSS parser issues
- Restored a stable 24px avatar size in the top bar

## 0.2.13

- Removed the remaining GNOME Shell CSS warning source from the avatar inline style
- Restored missing changelog entries for the recent 0.2.10 to 0.2.12 fixes

## 0.2.12

- Moved top-bar sizing and spacing from stylesheet rules into JS actor properties

## 0.2.11

- Removed the remaining risky shell CSS properties from the stylesheet
- Added error handling for the quick-settings `Open Preferences` action

## 0.2.10

- Replaced GNOME Shell-unsafe CSS lengths with fixed pixel values

## 0.2.9

- Fixed the top-bar computer-name slot to show hostname text again while staying layout-safe
- Refreshed the right-side user submenu on hostname, keep-awake, and top-bar visibility changes

## 0.2.8

- Restored hostname text next to the computer icon in the top bar
- Added `Show computer name` and `Show in top bar` toggles to both the left user menu and the right user submenu
- Highlighted the right-side user submenu when the top-bar user item is enabled
- Updated `release.sh` to always place a versioned release ZIP in `dist/`

## 0.2.7

- Stabilized the computer-name indicator layout so enabling it no longer changes the top-bar structure
- Kept the top-bar computer indicator as a compact fixed-width icon slot

## 0.2.6

- Kept the top-bar computer-name indicator compact by showing the PC icon without expanding the top-bar text width
- Extended the About page description and author line

## 0.2.5

- Restored a clearly visible computer-name display in the top bar with icon plus hostname text
- Split Preferences into separate pages for General, Keep Awake, and About
- Improved the avatar frame styling for a more circular appearance

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
