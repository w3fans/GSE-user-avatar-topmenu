# Username Avatar Top Menu

GNOME Shell extension that shows the current username with avatar in the top bar.
It can optionally append the computer name, so the label becomes `John at myPC`.
Current project version is stored in `VERSION`.

## Files

- `metadata.json`
- `extension.js`
- `prefs.js`
- `stylesheet.css`
- `schemas/org.gnome.shell.extensions.username-avatar.gschema.xml`

## Local install

1. Create the extension directory:
   `~/.local/share/gnome-shell/extensions/user-avatar-topmenu@basing.si`
2. Copy `metadata.json`, `extension.js`, `prefs.js`, `stylesheet.css`, and the `schemas` directory into that directory.
3. Compile the schema:
   `glib-compile-schemas ~/.local/share/gnome-shell/extensions/user-avatar-topmenu@basing.si/schemas`
4. Restart GNOME Shell or log out and back in.
5. Enable the extension:
   `gnome-extensions enable user-avatar-topmenu@basing.si`
6. Open preferences:
   `gnome-extensions prefs user-avatar-topmenu@basing.si`

## Package

Run:

```bash
gnome-extensions pack --force --out-dir . --extra-source prefs.js --extra-source VERSION --schema schemas/org.gnome.shell.extensions.username-avatar.gschema.xml .
```

That creates a zip you can install locally or upload later.

## Release

Patch release:

```bash
./release.sh
```

Minor or major release:

```bash
./release.sh 0.1.0 "Release v0.1.0"
./release.sh 1.0.0 "Release v1.0.0"
```

What `release.sh` does:

- bumps `VERSION`
- increments `metadata.json` `version`
- recompiles schemas
- rebuilds the extension zip
- commits the release
- creates a tag like `v0.0.2`
- pushes the branch and the tag

## Notes for listing

- A public GitHub repository is a good project home before adding a website later.
- The UUID is now domain-based for publishing: `user-avatar-topmenu@basing.si`.
- Reviewers expect production-ready metadata, screenshots, and clean behavior.
