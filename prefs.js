import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class UsernameAvatarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const version = this._getDisplayVersion();
        const desktopInterfaceSettings = new Gio.Settings({schema: 'org.gnome.desktop.interface'});
        const touchpadSettings = new Gio.Settings({schema: 'org.gnome.desktop.peripherals.touchpad'});

        window.set_default_size(700, 620);

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

        const showUsernameRow = new Adw.SwitchRow({
            title: 'Display username',
            subtitle: 'Controls whether the account name is shown in the top bar.',
        });

        settings.bind(
            'show-username',
            showUsernameRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const showAvatarRow = new Adw.SwitchRow({
            title: 'Display avatar',
            subtitle: 'Controls whether the user avatar is shown in the top bar.',
        });

        settings.bind(
            'show-avatar',
            showAvatarRow,
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
        generalGroup.add(showUsernameRow);
        generalGroup.add(showAvatarRow);
        generalGroup.add(placeAfterNavigationRow);
        generalGroup.add(showTopBarRow);
        generalGroup.add(showQuickSettingsRow);
        generalGroup.add(quickSettingsActionRow);
        generalPage.add(generalGroup);

        const desktopPage = new Adw.PreferencesPage({
            title: 'Desktop',
            icon_name: 'preferences-desktop-symbolic',
        });
        const desktopGroup = new Adw.PreferencesGroup({
            title: 'Desktop Behavior',
            description: 'Quick access to a couple of GNOME desktop defaults that many Fedora 44 and GNOME 50 users want to turn back on.',
        });

        const primaryPasteRow = new Adw.SwitchRow({
            title: 'Enable primary paste',
            subtitle: 'Restores middle-click paste from selected text by setting gtk-enable-primary-paste.',
        });
        primaryPasteRow.active = desktopInterfaceSettings.get_boolean('gtk-enable-primary-paste');
        primaryPasteRow.connect('notify::active', row => {
            desktopInterfaceSettings.set_boolean('gtk-enable-primary-paste', row.active);
        });

        const touchpadMiddleClickRow = new Adw.SwitchRow({
            title: 'Three-finger middle click',
            subtitle: 'Sets the touchpad tap button map to lrm so three-finger tap acts as middle click.',
        });
        touchpadMiddleClickRow.active = touchpadSettings.get_string('tap-button-map') === 'lrm';
        touchpadMiddleClickRow.connect('notify::active', row => {
            touchpadSettings.set_string('tap-button-map', row.active ? 'lrm' : 'default');
        });

        desktopGroup.add(primaryPasteRow);
        desktopGroup.add(touchpadMiddleClickRow);
        desktopPage.add(desktopGroup);

        const loadsPage = new Adw.PreferencesPage({
            title: 'Loads',
            icon_name: 'utilities-system-monitor-symbolic',
        });
        const loadsGroup = new Adw.PreferencesGroup({
            title: 'System Loads',
            description: 'Choose which live usage columns are shown in the top bar.',
        });
        const loadsPositionRow = new Adw.ComboRow({
            title: 'Display position',
            subtitle: 'Left shows loads after the user item; right shows loads before the system icons.',
            model: Gtk.StringList.new(['Left side', 'Right side']),
            selected: settings.get_string('loads-position') === 'right' ? 1 : 0,
        });
        loadsPositionRow.connect('notify::selected', row => {
            settings.set_string('loads-position', row.selected === 1 ? 'right' : 'left');
        });
        loadsGroup.add(loadsPositionRow);
        this._addPollingIntervalRow(loadsGroup, settings, 'loads-refresh-seconds', 'Usage polling interval', 'Seconds between CPU, memory, swap, and GPU usage updates.', 30);
        this._addBoundSwitch(loadsGroup, settings, 'show-load-cpu', 'CPU usage', 'Shows CPU load as a percentage column.');
        this._addBoundSwitch(loadsGroup, settings, 'show-load-mem', 'Memory usage', 'Shows memory utilization with used and total memory in the tooltip.');
        this._addBoundSwitch(loadsGroup, settings, 'show-load-swap', 'Swap usage', 'Shows swap utilization when swap is configured.');
        this._addBoundSwitch(loadsGroup, settings, 'show-load-igpu', 'Integrated GPU usage', 'Shows iGPU usage and memory details when exposed by the driver.');
        this._addBoundSwitch(loadsGroup, settings, 'show-load-dgpu', 'Discrete GPU usage', 'Shows dGPU usage and memory details when exposed by the driver.');
        this._addBoundSwitch(loadsGroup, settings, 'use-load-colors', 'Use colored usage icons', 'Disable this to show usage icons and bars in the default white panel color.');
        loadsPage.add(loadsGroup);

        const tempsPage = new Adw.PreferencesPage({
            title: 'Temps',
            icon_name: 'temperature-symbolic',
        });
        const tempsGroup = new Adw.PreferencesGroup({
            title: 'Temperatures',
            description: 'Choose which live temperature columns are shown in the top bar.',
        });
        const tempsPositionRow = new Adw.ComboRow({
            title: 'Display position',
            subtitle: 'Left shows temperatures after loads; right shows temperatures before loads.',
            model: Gtk.StringList.new(['Left side', 'Right side']),
            selected: settings.get_string('temps-position') === 'right' ? 1 : 0,
        });
        tempsPositionRow.connect('notify::selected', row => {
            settings.set_string('temps-position', row.selected === 1 ? 'right' : 'left');
        });
        tempsGroup.add(tempsPositionRow);
        this._addPollingIntervalRow(tempsGroup, settings, 'temps-refresh-seconds', 'Temperature polling interval', 'Seconds between CPU and GPU temperature updates.', 60);
        const temperatureUnitRow = new Adw.ComboRow({
            title: 'Temperature unit',
            subtitle: 'Choose Celsius or Fahrenheit for panel values and tooltips.',
            model: Gtk.StringList.new(['Celsius (°C)', 'Fahrenheit (°F)']),
            selected: settings.get_string('temperature-unit') === 'fahrenheit' ? 1 : 0,
        });
        temperatureUnitRow.connect('notify::selected', row => {
            settings.set_string('temperature-unit', row.selected === 1 ? 'fahrenheit' : 'celsius');
        });
        tempsGroup.add(temperatureUnitRow);
        this._addBoundSwitch(tempsGroup, settings, 'temperature-decimals', 'Show decimal values', 'Shows one decimal place for temperatures when the sensor provides it.');
        this._addBoundSwitch(tempsGroup, settings, 'show-temp-cpu', 'CPU temperature', 'Shows the CPU package temperature when available.');
        this._addBoundSwitch(tempsGroup, settings, 'show-temp-igpu', 'Integrated GPU temperature', 'Shows iGPU temperature when available.');
        this._addBoundSwitch(tempsGroup, settings, 'show-temp-dgpu', 'Discrete GPU temperature', 'Shows dGPU temperature when available.');
        this._addBoundSwitch(tempsGroup, settings, 'use-temp-colors', 'Use colored temperature icons', 'Disable this to show temperature icons and values in the default white panel color.');
        tempsPage.add(tempsGroup);

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
        this._addBoundSwitch(awakeGroup, settings, 'keep-awake-fullscreen', 'Automatic for fullscreen apps', 'Keeps the session awake while the focused app is fullscreen.');
        this._addBoundSwitch(awakeGroup, settings, 'keep-awake-media', 'Automatic while media is playing', 'Keeps the session awake while an MPRIS-compatible app reports playback.');
        awakePage.add(awakeGroup);

        const timerGroup = new Adw.PreferencesGroup({
            title: 'Timer',
            description: 'Temporarily keep the session awake, then turn the timer off automatically.',
        });
        const timerDurations = [15, 30, 60, 120];
        const timerMinutes = settings.get_uint('keep-awake-timer-minutes');
        const timerDurationRow = new Adw.ComboRow({
            title: 'Duration',
            subtitle: 'Duration used whenever the timer is started.',
            model: Gtk.StringList.new(['15 minutes', '30 minutes', '1 hour', '2 hours']),
            selected: Math.max(0, timerDurations.indexOf(timerMinutes)),
        });
        timerDurationRow.connect('notify::selected', row => {
            settings.set_uint('keep-awake-timer-minutes', timerDurations[row.selected] ?? 30);
        });
        timerGroup.add(timerDurationRow);
        this._addBoundSwitch(timerGroup, settings, 'keep-awake-timer-active', 'Start keep-awake timer', 'Switch off to cancel early; it also switches off automatically when time expires.');
        awakePage.add(timerGroup);

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
            subtitle: 'Shows your avatar and username in the GNOME top bar with optional hostname, hardware-style CPU, RAM, swap and GPU usage icons, CPU/GPU temperature indicators, hover tooltips with usage bars and hardware details, separate polling intervals, manual and automatic keep-awake modes, smart top-bar autohide, a quick settings user tile, and desktop convenience toggles for GNOME 50 and Fedora 44.',
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
        window.add(desktopPage);
        window.add(loadsPage);
        window.add(tempsPage);
        window.add(autohidePage);
        window.add(aboutPage);
    }

    _addBoundSwitch(group, settings, key, title, subtitle) {
        const row = new Adw.SwitchRow({title, subtitle});
        settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(row);
    }

    _addPollingIntervalRow(group, settings, key, title, subtitle, upper) {
        const row = new Adw.ActionRow({
            title,
            subtitle,
        });
        const adjustment = new Gtk.Adjustment({
            lower: 1,
            upper,
            step_increment: 1,
            page_increment: 5,
            value: settings.get_uint(key),
        });
        const spin = new Gtk.SpinButton({
            adjustment,
            digits: 0,
            valign: Gtk.Align.CENTER,
        });
        spin.connect('value-changed', widget => {
            settings.set_uint(key, widget.get_value_as_int());
        });
        settings.connect(`changed::${key}`, () => {
            const value = settings.get_uint(key);
            if (spin.get_value_as_int() !== value)
                spin.set_value(value);
        });
        row.add_suffix(spin);
        row.activatable_widget = spin;
        group.add(row);
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
