import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class UsernameAvatarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const version = this._getDisplayVersion();

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: 'Label',
            description: 'Choose what text appears next to the avatar in the top bar.',
        });

        const showHostRow = new Adw.SwitchRow({
            title: 'Include computer name',
            subtitle: 'Appends the hostname, for example "John at myPC".',
        });

        settings.bind(
            'show-hostname',
            showHostRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const placeAfterNavigationRow = new Adw.SwitchRow({
            title: 'Place after Apps and Places',
            subtitle: 'When enabled, the panel item moves after those menus if they are present.',
        });

        settings.bind(
            'place-after-navigation',
            placeAfterNavigationRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const showTopBarRow = new Adw.SwitchRow({
            title: 'Show in top bar',
            subtitle: 'Disable this if you only want the quick settings menu entry.',
        });

        settings.bind(
            'show-topbar',
            showTopBarRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        group.add(showHostRow);
        group.add(placeAfterNavigationRow);
        group.add(showTopBarRow);
        page.add(group);

        const awakeGroup = new Adw.PreferencesGroup({
            title: 'Keep Awake',
            description: 'Prevent the session from going idle while the toggle is enabled.',
        });
        const keepAwakeRow = new Adw.SwitchRow({
            title: 'Block screen saver',
            subtitle: 'Shows a colored sun icon in the panel while active and also appears in the user submenu.',
        });
        settings.bind(
            'keep-awake',
            keepAwakeRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        awakeGroup.add(keepAwakeRow);
        page.add(awakeGroup);

        const infoGroup = new Adw.PreferencesGroup({
            title: 'About',
        });
        const descriptionRow = new Adw.ActionRow({
            title: 'Description',
            subtitle: 'Shows your avatar and name in the top bar, with optional hostname and keep-awake controls.',
        });
        const authorRow = new Adw.ActionRow({
            title: 'Author',
            subtitle: 'Denis Zvegelj',
        });
        const licenseRow = new Adw.ActionRow({
            title: 'License',
            subtitle: 'GNU GPL v3',
        });
        const versionRow = new Adw.ActionRow({
            title: 'Installed version',
            subtitle: version,
        });
        infoGroup.add(descriptionRow);
        infoGroup.add(authorRow);
        infoGroup.add(licenseRow);
        infoGroup.add(versionRow);
        page.add(infoGroup);

        window.add(page);
    }

    _getDisplayVersion() {
        const versionPath = GLib.build_filenamev([this.path, 'VERSION']);

        try {
            const [ok, contents] = Gio.File.new_for_path(versionPath).load_contents(null);

            if (ok)
                return new TextDecoder().decode(contents).trim();
        } catch (error) {
            console.debug(`Unable to read VERSION file: ${error.message}`);
        }

        return `metadata ${this.metadata.version}`;
    }
}
