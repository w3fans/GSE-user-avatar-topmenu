import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class UsernameAvatarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const version = this._getDisplayVersion();

        const generalPage = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'avatar-default-symbolic',
        });
        const generalGroup = new Adw.PreferencesGroup({
            title: 'Label',
            description: 'Choose what text appears next to the avatar in the top bar.',
        });

        const showHostRow = new Adw.SwitchRow({
            title: 'Include computer name',
            subtitle: 'Shows a computer icon with the hostname, for example "John on myPC".',
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

        const showQuickSettingsRow = new Adw.SwitchRow({
            title: 'Show in quick settings',
            subtitle: 'Controls whether the username tile appears in the right-side quick settings menu.',
        });

        settings.bind(
            'show-quick-settings',
            showQuickSettingsRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const quickSettingsActionRow = new Adw.SwitchRow({
            title: 'Clicking username disables extension',
            subtitle: 'When disabled, clicking the username tile in quick settings only hides the top-bar entry.',
        });

        settings.bind(
            'quick-settings-toggle-topbar-only',
            quickSettingsActionRow,
            'active',
            Gio.SettingsBindFlags.INVERT_BOOLEAN
        );

        generalGroup.add(showHostRow);
        generalGroup.add(placeAfterNavigationRow);
        generalGroup.add(showTopBarRow);
        generalGroup.add(showQuickSettingsRow);
        generalGroup.add(quickSettingsActionRow);
        generalPage.add(generalGroup);

        const awakePage = new Adw.PreferencesPage({
            title: 'Keep Awake',
            icon_name: 'weather-clear-symbolic',
        });
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
        awakePage.add(awakeGroup);

        const autohidePage = new Adw.PreferencesPage({
            title: 'Autohide',
            icon_name: 'view-fullscreen-symbolic',
        });
        const autohideGroup = new Adw.PreferencesGroup({
            title: 'Top Bar Autohide',
            description: 'Choose when the GNOME top bar should hide automatically.',
        });
        const hideInFullscreenRow = new Adw.SwitchRow({
            title: 'Hide in fullscreen',
            subtitle: 'Hide the top bar whenever the focused app is fullscreen.',
        });
        settings.bind(
            'hide-topbar-fullscreen',
            hideInFullscreenRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        const hideFullscreenAllMonitorsRow = new Adw.SwitchRow({
            title: 'Fullscreen on all monitors',
            subtitle: 'When enabled, fullscreen autohide applies to focused fullscreen windows on any monitor, not only the primary one.',
        });
        settings.bind(
            'hide-topbar-fullscreen-all-monitors',
            hideFullscreenAllMonitorsRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        const hideMaximizedRow = new Adw.SwitchRow({
            title: 'Hide when maximized',
            subtitle: 'Hide the top bar whenever the focused window is maximized.',
        });
        settings.bind(
            'hide-topbar-maximized',
            hideMaximizedRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        const hideTouchingRow = new Adw.SwitchRow({
            title: 'Hide when touching top bar',
            subtitle: 'Hide the top bar whenever the focused window reaches the top edge of the screen.',
        });
        settings.bind(
            'hide-topbar-touching',
            hideTouchingRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        autohideGroup.add(hideInFullscreenRow);
        autohideGroup.add(hideFullscreenAllMonitorsRow);
        autohideGroup.add(hideMaximizedRow);
        autohideGroup.add(hideTouchingRow);
        autohidePage.add(autohideGroup);

        const aboutPage = new Adw.PreferencesPage({
            title: 'About',
            icon_name: 'help-about-symbolic',
        });
        const infoGroup = new Adw.PreferencesGroup({
            title: 'About',
        });
        const descriptionRow = new Adw.ActionRow({
            title: 'Description',
            subtitle: 'Shows your avatar and username in the GNOME top bar with an optional computer name, keep-awake control, separate top-bar autohide rules for fullscreen, maximized, and top-edge windows, plus an optional quick settings user tile with session actions.',
        });
        const authorRow = new Adw.ActionRow({
            title: 'Author',
            subtitle: 'Denis Zvegelj, 2026',
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
        const disableRow = new Adw.ActionRow({
            title: 'Disable extension',
            subtitle: 'Turns the extension off from Preferences.',
        });
        const disableButton = new Gtk.Button({
            label: 'Disable',
            valign: Gtk.Align.CENTER,
        });
        disableButton.connect('clicked', () => {
            const launcher = Gio.Subprocess.new(
                ['gnome-extensions', 'disable', this.metadata.uuid],
                Gio.SubprocessFlags.NONE
            );
            launcher.wait_async(null, null);
        });
        disableRow.add_suffix(disableButton);
        disableRow.activatable_widget = disableButton;
        infoGroup.add(disableRow);
        aboutPage.add(infoGroup);

        const supportGroup = new Adw.PreferencesGroup({
            title: 'Support',
        });
        const supportRow = new Adw.ActionRow({
            title: 'Support further development',
            subtitle: 'If this extension is useful, you can support future development on idz.si.',
        });
        const supportButton = Gtk.LinkButton.new_with_label(
            'https://idz.si/bs/gse-user-avatar-topmenu-donate.html',
            'Open Donation Page'
        );
        supportRow.add_suffix(supportButton);
        supportRow.activatable_widget = supportButton;
        supportGroup.add(supportRow);
        aboutPage.add(supportGroup);

        window.add(generalPage);
        window.add(awakePage);
        window.add(autohidePage);
        window.add(aboutPage);
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
