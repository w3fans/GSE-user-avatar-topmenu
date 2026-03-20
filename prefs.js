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

        group.add(showHostRow);
        page.add(group);

        const infoGroup = new Adw.PreferencesGroup({
            title: 'About',
        });
        const versionRow = new Adw.ActionRow({
            title: 'Installed version',
            subtitle: version,
        });
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
