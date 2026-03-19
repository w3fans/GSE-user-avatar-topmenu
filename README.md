# Username Avatar Top Menu

GNOME Shell extension that shows the current username with avatar in the top bar.
It can optionally append the computer name, so the label becomes `John at myPC`.

## Files

- `metadata.json`
- `extension.js`
- `prefs.js`
- `stylesheet.css`
- `schemas/org.gnome.shell.extensions.username-avatar.gschema.xml`

## Local install

1. Create the extension directory:
   `~/.local/share/gnome-shell/extensions/username-avatar@local.testing`
2. Copy `metadata.json`, `extension.js`, `prefs.js`, `stylesheet.css`, and the `schemas` directory into that directory.
3. Compile the schema:
   `glib-compile-schemas ~/.local/share/gnome-shell/extensions/username-avatar@local.testing/schemas`
4. Restart GNOME Shell or log out and back in.
5. Enable the extension:
   `gnome-extensions enable username-avatar@local.testing`
6. Open preferences:
   `gnome-extensions prefs username-avatar@local.testing`

## Package

Run:

```bash
gnome-extensions pack --force --out-dir . --extra-source prefs.js --schema schemas/org.gnome.shell.extensions.username-avatar.gschema.xml .
```

That creates a zip you can install locally or upload later.

## Notes for listing

- Before submitting to extensions.gnome.org, change the UUID to one you control.
- Reviewers expect production-ready metadata, screenshots, and clean behavior.
