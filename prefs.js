import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class UsernameAvatarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

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
            Gtk.SettingsBindFlags.DEFAULT
        );

        group.add(showHostRow);
        page.add(group);
        window.add(page);
    }
}
