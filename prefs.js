import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class UsernameAvatarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const _ = this.gettext.bind(this);
        const settings = this.getSettings();
        const version = this._getDisplayVersion();
        const desktopInterfaceSettings = new Gio.Settings({schema: 'org.gnome.desktop.interface'});
        const touchpadSettings = new Gio.Settings({schema: 'org.gnome.desktop.peripherals.touchpad'});

        window.set_default_size(700, 620);

        const generalPage = new Adw.PreferencesPage({
            title: _('General'),
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
            title: 'Display name',
            subtitle: 'Controls whether the account real/display name is shown in the top bar.',
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

        generalGroup.add(showHostRow);
        generalGroup.add(showUsernameRow);
        generalGroup.add(showAvatarRow);
        generalGroup.add(placeAfterNavigationRow);
        generalGroup.add(showTopBarRow);
        generalGroup.add(showQuickSettingsRow);
        generalPage.add(generalGroup);

        const desktopPage = new Adw.PreferencesPage({
            title: _('Desktop'),
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
            if (desktopInterfaceSettings.get_boolean('gtk-enable-primary-paste') !== row.active)
                desktopInterfaceSettings.set_boolean('gtk-enable-primary-paste', row.active);
        });
        desktopInterfaceSettings.connect('changed::gtk-enable-primary-paste', () => {
            primaryPasteRow.active = desktopInterfaceSettings.get_boolean('gtk-enable-primary-paste');
        });

        const touchpadMiddleClickRow = new Adw.SwitchRow({
            title: 'Three-finger middle click',
            subtitle: 'Sets the touchpad tap button map to lrm so three-finger tap acts as middle click.',
        });
        touchpadMiddleClickRow.active = touchpadSettings.get_string('tap-button-map') === 'lrm';
        touchpadMiddleClickRow.connect('notify::active', row => {
            const current = touchpadSettings.get_string('tap-button-map');
            if (row.active) {
                if (current !== 'lrm')
                    settings.set_string('touchpad-previous-map', current);
                touchpadSettings.set_string('tap-button-map', 'lrm');
            } else if (current === 'lrm') {
                touchpadSettings.set_string(
                    'tap-button-map',
                    settings.get_string('touchpad-previous-map') || 'default'
                );
                settings.set_string('touchpad-previous-map', '');
            }
        });
        touchpadSettings.connect('changed::tap-button-map', () => {
            touchpadMiddleClickRow.active = touchpadSettings.get_string('tap-button-map') === 'lrm';
        });

        desktopGroup.add(primaryPasteRow);
        desktopGroup.add(touchpadMiddleClickRow);
        desktopPage.add(desktopGroup);

        const loadsPage = new Adw.PreferencesPage({
            title: _('System Loads'),
            icon_name: 'power-profile-performance-symbolic',
        });
        const loadsGroup = new Adw.PreferencesGroup({
            title: 'System Loads',
            description: 'Choose which live usage columns are shown in the top bar.',
        });
        const loadsPositionRow = new Adw.ComboRow({
            title: 'Display position',
            subtitle: 'Left shows loads after the user item; right shows loads before the system icons.',
            model: Gtk.StringList.new([_('Left side'), _('Right side')]),
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
        this._addBoundSwitch(loadsGroup, settings, 'show-load-network', 'Network throughput', 'Shows aggregate download speed with upload speed in the tooltip.');
        this._addBoundSwitch(loadsGroup, settings, 'show-load-disk', 'Disk activity', 'Shows aggregate physical-disk read speed with write speed in the tooltip.');
        this._addBoundSwitch(loadsGroup, settings, 'use-load-colors', 'Use colored usage icons', 'Disable this to show usage icons and bars in the default white panel color.');
        const metricOrderRow = new Adw.EntryRow({
            title: 'Metric order',
            text: settings.get_string('metric-order'),
        });
        metricOrderRow.add_css_class('property');
        metricOrderRow.connect('changed', row => {
            settings.set_string('metric-order', row.text);
        });
        settings.connect('changed::metric-order', () => {
            if (metricOrderRow.text !== settings.get_string('metric-order'))
                metricOrderRow.text = settings.get_string('metric-order');
        });
        loadsGroup.add(metricOrderRow);
        loadsPage.add(loadsGroup);

        const deviceGroup = new Adw.PreferencesGroup({
            title: 'GPU Devices',
            description: 'Override automatic GPU classification when a hybrid or AMD-only system is detected incorrectly.',
        });
        const gpuChoices = this._getGpuChoices();
        this._addDeviceRow(deviceGroup, settings, 'igpu-device', 'Integrated GPU', gpuChoices);
        this._addDeviceRow(deviceGroup, settings, 'dgpu-device', 'Discrete GPU', gpuChoices);
        this._addPollingIntervalRow(deviceGroup, settings, 'nvidia-index', 'NVIDIA GPU index', 'Zero-based nvidia-smi device index for systems with multiple NVIDIA GPUs.', 15, 0);
        loadsPage.add(deviceGroup);

        const networkGroup = new Adw.PreferencesGroup({
            title: 'Network Device',
            description: 'Automatic aggregates physical network interfaces and avoids double-counting virtual bridges.',
        });
        this._addDeviceRow(networkGroup, settings, 'network-interface', 'Network interface', this._getNetworkChoices());
        loadsPage.add(networkGroup);

        const performanceGroup = new Adw.PreferencesGroup({
            title: 'Performance and Power',
            description: 'Polling stops while locked and slows down on battery by default.',
        });
        this._addBoundSwitch(performanceGroup, settings, 'pause-metrics-when-locked', 'Pause while locked', 'Avoids unnecessary hardware polling on the lock screen.');
        this._addBoundSwitch(performanceGroup, settings, 'adaptive-refresh-on-battery', 'Reduce polling on battery', 'Uses a longer interval while UPower reports battery operation.');
        this._addPollingIntervalRow(performanceGroup, settings, 'battery-refresh-multiplier', 'Battery interval multiplier', 'Multiplier applied to normal metric polling intervals.', 10, 2);
        const clickActionRow = new Adw.ComboRow({
            title: 'Metric click action',
            subtitle: 'Choose what happens when a metric is clicked or keyboard-activated.',
            model: Gtk.StringList.new([_('Open System Monitor'), _('Do nothing')]),
            selected: settings.get_string('metrics-click-action') === 'none' ? 1 : 0,
        });
        clickActionRow.connect('notify::selected', row => {
            settings.set_string('metrics-click-action', row.selected === 1 ? 'none' : 'system-monitor');
        });
        performanceGroup.add(clickActionRow);
        loadsPage.add(performanceGroup);

        const tempsPage = new Adw.PreferencesPage({
            title: _('Temperatures'),
            icon_name: 'temperature-symbolic',
        });
        const tempsGroup = new Adw.PreferencesGroup({
            title: 'Temperatures',
            description: 'Choose which live temperature columns are shown in the top bar.',
        });
        const tempsPositionRow = new Adw.ComboRow({
            title: 'Display position',
            subtitle: 'Left shows temperatures after loads; right shows temperatures before loads.',
            model: Gtk.StringList.new([_('Left side'), _('Right side')]),
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
            model: Gtk.StringList.new([_('Celsius (°C)'), _('Fahrenheit (°F)')]),
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
        const warningSpin = this._addPollingIntervalRow(tempsGroup, settings, 'temp-warning', 'Warning threshold', 'Temperature in Celsius where the orange warning color begins.', 100, 30);
        const criticalSpin = this._addPollingIntervalRow(tempsGroup, settings, 'temp-critical', 'Critical threshold', 'Temperature in Celsius where the red critical color begins.', 120, 40);
        warningSpin.connect('value-changed', () => {
            if (warningSpin.get_value_as_int() >= criticalSpin.get_value_as_int())
                criticalSpin.set_value(Math.min(120, warningSpin.get_value_as_int() + 5));
        });
        criticalSpin.connect('value-changed', () => {
            if (criticalSpin.get_value_as_int() <= warningSpin.get_value_as_int())
                warningSpin.set_value(Math.max(30, criticalSpin.get_value_as_int() - 5));
        });
        const tempOrderRow = new Adw.EntryRow({
            title: 'Temperature order',
            text: settings.get_string('temp-order'),
        });
        tempOrderRow.connect('changed', row => settings.set_string('temp-order', row.text));
        tempsGroup.add(tempOrderRow);
        tempsPage.add(tempsGroup);

        const awakePage = new Adw.PreferencesPage({
            title: _('Keep Awake'),
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
            model: Gtk.StringList.new([_('15 minutes'), _('30 minutes'), _('1 hour'), _('2 hours')]),
            selected: Math.max(0, timerDurations.indexOf(timerMinutes)),
        });
        timerDurationRow.connect('notify::selected', row => {
            settings.set_uint('keep-awake-timer-minutes', timerDurations[row.selected] ?? 30);
        });
        timerGroup.add(timerDurationRow);
        this._addBoundSwitch(timerGroup, settings, 'keep-awake-timer-active', 'Start keep-awake timer', 'Switch off to cancel early; it also switches off automatically when time expires.');
        awakePage.add(timerGroup);

        const autohidePage = new Adw.PreferencesPage({
            title: _('Autohide'),
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
        const syncFullscreenDependency = () => {
            hideFullscreenAllMonitorsRow.sensitive = settings.get_boolean('hide-topbar-fullscreen');
        };
        settings.connect('changed::hide-topbar-fullscreen', syncFullscreenDependency);
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
        syncFullscreenDependency();
        autohidePage.add(autohideGroup);

        const diagnosticsPage = new Adw.PreferencesPage({
            title: _('Diagnostics'),
            icon_name: 'preferences-system-symbolic',
        });
        const diagnosticsGroup = new Adw.PreferencesGroup({
            title: 'Detected Hardware',
            description: 'Read-only local information used by the extension. No data is transmitted.',
        });
        for (const [title, subtitle] of this._getDiagnostics())
            diagnosticsGroup.add(new Adw.ActionRow({title, subtitle}));
        diagnosticsPage.add(diagnosticsGroup);

        const resetGroup = new Adw.PreferencesGroup({
            title: 'Reset',
            description: 'Restore every extension preference to its schema default.',
        });
        const resetRow = new Adw.ActionRow({
            title: 'Reset extension settings',
            subtitle: 'Desktop-wide primary-paste and touchpad settings are not reset.',
        });
        const resetButton = new Gtk.Button({
            label: 'Reset to Defaults',
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });
        resetButton.connect('clicked', () => {
            for (const key of settings.list_keys())
                settings.reset(key);
        });
        resetRow.add_suffix(resetButton);
        resetRow.activatable_widget = resetButton;
        resetGroup.add(resetRow);
        diagnosticsPage.add(resetGroup);

        const aboutPage = new Adw.PreferencesPage({
            title: _('About'),
            icon_name: 'help-about-symbolic',
        });
        const infoGroup = new Adw.PreferencesGroup({
            title: 'About',
        });
        const descriptionRow = new Adw.ActionRow({
            title: 'Description',
            subtitle: this.metadata.description,
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
        window.add(loadsPage);
        window.add(awakePage);
        window.add(desktopPage);
        window.add(tempsPage);
        window.add(autohidePage);
        window.add(diagnosticsPage);
        window.add(aboutPage);
        this._localizeWidgetTree(window, _);
    }

    _addBoundSwitch(group, settings, key, title, subtitle) {
        const row = new Adw.SwitchRow({
            title: this.gettext(title),
            subtitle: this.gettext(subtitle),
        });
        settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(row);
    }

    _addPollingIntervalRow(group, settings, key, title, subtitle, upper, lower = 1) {
        const row = new Adw.ActionRow({
            title: this.gettext(title),
            subtitle: this.gettext(subtitle),
        });
        const adjustment = new Gtk.Adjustment({
            lower,
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
        return spin;
    }

    _getGpuChoices() {
        const choices = [{id: 'auto', label: 'Automatic'}];
        try {
            const directory = Gio.File.new_for_path('/sys/class/drm');
            const enumerator = directory.enumerate_children(
                'standard::name', Gio.FileQueryInfoFlags.NONE, null);
            let info;
            while ((info = enumerator.next_file(null))) {
                const name = info.get_name();
                if (/^card\d+$/.test(name) &&
                    GLib.file_test(`/sys/class/drm/${name}/device`, GLib.FileTest.IS_DIR))
                    choices.push({id: name, label: name});
            }
            enumerator.close(null);
        } catch (_error) {
            // Keep the automatic choice when sysfs is unavailable.
        }
        return choices;
    }

    _getNetworkChoices() {
        const choices = [{id: 'auto', label: 'Automatic physical interfaces'}];
        try {
            const enumerator = Gio.File.new_for_path('/sys/class/net').enumerate_children(
                'standard::name', Gio.FileQueryInfoFlags.NONE, null);
            let info;
            while ((info = enumerator.next_file(null))) {
                const name = info.get_name();
                if (name !== 'lo')
                    choices.push({id: name, label: name});
            }
            enumerator.close(null);
        } catch (_error) {
            // Keep the automatic choice.
        }
        return choices;
    }

    _addDeviceRow(group, settings, key, title, choices) {
        const current = settings.get_string(key);
        const selected = Math.max(0, choices.findIndex(choice => choice.id === current));
        const row = new Adw.ComboRow({
            title: this.gettext(title),
            subtitle: this.gettext('Automatic is recommended unless the wrong GPU is shown.'),
            model: Gtk.StringList.new(choices.map(choice => this.gettext(choice.label))),
            selected,
        });
        row.connect('notify::selected', widget => {
            settings.set_string(key, choices[widget.selected]?.id ?? 'auto');
        });
        group.add(row);
    }

    _getDiagnostics() {
        const gpuNames = this._getGpuChoices().slice(1).map(choice => choice.label);
        const hwmon = [];
        try {
            const enumerator = Gio.File.new_for_path('/sys/class/hwmon').enumerate_children(
                'standard::name', Gio.FileQueryInfoFlags.NONE, null);
            let info;
            while ((info = enumerator.next_file(null))) {
                const directoryName = info.get_name();
                const nameFile = Gio.File.new_for_path(`/sys/class/hwmon/${directoryName}/name`);
                try {
                    const [ok, contents] = nameFile.load_contents(null);
                    hwmon.push(ok
                        ? new TextDecoder().decode(contents).trim()
                        : directoryName);
                } catch (_error) {
                    hwmon.push(directoryName);
                }
            }
            enumerator.close(null);
        } catch (_error) {
            // Report the empty state below.
        }
        return [
            ['DRM devices', gpuNames.length ? gpuNames.join(', ') : 'No DRM cards detected'],
            ['Hardware monitors', hwmon.length ? [...new Set(hwmon)].join(', ') : 'No hwmon devices detected'],
            ['NVIDIA metrics', GLib.find_program_in_path('nvidia-smi') ? 'nvidia-smi is installed' : 'nvidia-smi is not installed'],
            ['Memory inventory', GLib.find_program_in_path('dmidecode') ? 'dmidecode is installed; access may be restricted' : 'dmidecode is not installed'],
        ];
    }

    _localizeWidgetTree(widget, gettext) {
        if (widget instanceof Adw.PreferencesPage || widget instanceof Adw.PreferencesGroup ||
            widget instanceof Adw.ActionRow || widget instanceof Adw.EntryRow) {
            if (widget.title)
                widget.title = gettext(widget.title);
        }
        if (widget instanceof Adw.PreferencesGroup && widget.description)
            widget.description = gettext(widget.description);
        if (widget instanceof Adw.ActionRow && widget.subtitle)
            widget.subtitle = gettext(widget.subtitle);
        if (widget instanceof Gtk.Button && widget.label)
            widget.label = gettext(widget.label);

        for (let child = widget.get_first_child?.(); child; child = child.get_next_sibling())
            this._localizeWidgetTree(child, gettext);
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
