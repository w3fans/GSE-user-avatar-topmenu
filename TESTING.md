# Testing and Submission

Run the complete local validation and deterministic package build:

```bash
./validate.sh
./build
./ego-check.sh
```

The unit suite covers CPU and DRM utilization math, binary units, `/proc`
network/disk parsing, DMI memory parsing, persistent timer deadlines, and
multi-monitor geometry. A fresh nested GNOME Shell can exercise module loading,
actor construction, timers, and shutdown without replacing the desktop
session:

```bash
gnome-extensions install --force ./user-avatar-topmenu@basing.si.shell-extension.zip
timeout 20s dbus-run-session -- \
  gnome-shell --wayland --no-x11 --mode=user
```

Headless nested Shell lacks a normal SessionManager and physical monitors, so
its service warnings are not release failures. It also cannot validate pointer
interaction, real fullscreen/maximize transitions, GPU counters, temperatures,
or the visual panel layout.

Before an EGO upload, manually test the following on every available supported
GNOME version (45 through 51):

1. Enable, disable, reload, and log in with the extension enabled.
2. Open Preferences and every page; reset defaults.
3. Toggle top-bar and Quick Settings visibility and verify no duplicate actors.
4. Exercise every keep-awake source and confirm the persisted timer expires at
   its original deadline after a Shell reload.
5. Exercise fullscreen, maximized, touching-edge, multi-monitor autohide, and
   top-edge reveal.
6. Enable each available metric, hover and keyboard-focus it, verify values
   against system tools, select alternate devices, and test battery/lock polling.
7. Inspect the Shell journal for errors during operation and shutdown.

For the private SU companion, test Hardware → keyboard inactivity: select a
15-second timeout, verify blanking, then restore using a key and touchpad
movement. Verify Never, manual Off, changing the timeout while blanked, and
disable while blanked. These controls require the installed model-specific
helper and its existing sudo policy. Mouse activity also restores the light.

`ego-check.sh` automates reviewer-safety and package-content preflight. The EGO
upload itself remains manual because it requires the maintainer's authenticated
GNOME Extensions account and an explicit submission decision. Never upload a
`su` artifact.
