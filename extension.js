import St from 'gi://St';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const AVATAR_SIZE = 24;
const INHIBIT_IDLE_FLAG = 8;

const UserQuickToggle = GObject.registerClass(
class UserQuickToggle extends QuickSettings.QuickMenuToggle {
    _init(extension) {
        super._init({
            title: extension._getDisplayName(),
            iconName: 'avatar-default-symbolic',
        });

        this._extension = extension;
        this._settings = extension._settings;

        this.menu.setHeader('avatar-default-symbolic', extension._getDisplayName(), null);

        this._keepAwakeItem = new PopupMenu.PopupSwitchMenuItem(
            'Keep awake',
            this._settings.get_boolean('keep-awake')
        );
        this._keepAwakeToggledId = this._keepAwakeItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('keep-awake', state);
        });
        this.menu.addMenuItem(this._keepAwakeItem);

        this._showHostnameItem = new PopupMenu.PopupSwitchMenuItem(
            'Show computer name',
            this._settings.get_boolean('show-hostname')
        );
        this._showHostnameToggledId = this._showHostnameItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('show-hostname', state);
        });
        this.menu.addMenuItem(this._showHostnameItem);

        this._showQuickSettingsItem = new PopupMenu.PopupSwitchMenuItem(
            'Show in quick settings',
            this._settings.get_boolean('show-quick-settings')
        );
        this._showQuickSettingsToggledId = this._showQuickSettingsItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('show-quick-settings', state);
        });
        this.menu.addMenuItem(this._showQuickSettingsItem);

        this._hideFullscreenItem = new PopupMenu.PopupSwitchMenuItem(
            'Hide in fullscreen',
            this._settings.get_boolean('hide-topbar-fullscreen')
        );
        this._hideFullscreenToggledId = this._hideFullscreenItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('hide-topbar-fullscreen', state);
        });
        this.menu.addMenuItem(this._hideFullscreenItem);

        this._hideFullscreenAllMonitorsItem = new PopupMenu.PopupSwitchMenuItem(
            'Fullscreen on all monitors',
            this._settings.get_boolean('hide-topbar-fullscreen-all-monitors')
        );
        this._hideFullscreenAllMonitorsToggledId = this._hideFullscreenAllMonitorsItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('hide-topbar-fullscreen-all-monitors', state);
        });
        this.menu.addMenuItem(this._hideFullscreenAllMonitorsItem);

        this._hideMaximizedItem = new PopupMenu.PopupSwitchMenuItem(
            'Hide when maximized',
            this._settings.get_boolean('hide-topbar-maximized')
        );
        this._hideMaximizedToggledId = this._hideMaximizedItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('hide-topbar-maximized', state);
        });
        this.menu.addMenuItem(this._hideMaximizedItem);

        this._hideTouchingItem = new PopupMenu.PopupSwitchMenuItem(
            'Hide when touching top bar',
            this._settings.get_boolean('hide-topbar-touching')
        );
        this._hideTouchingToggledId = this._hideTouchingItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('hide-topbar-touching', state);
        });
        this.menu.addMenuItem(this._hideTouchingItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction('Open Preferences', () => {
            this._extension.openPreferences().catch(error => {
                console.error(`Failed to open preferences: ${error.message}`);
            });
        });
        this.menu.addAction('Lock Screen', () => {
            Util.spawn(['loginctl', 'lock-session']);
        });
        this.menu.addAction('Log Out', () => {
            Util.spawn(['gnome-session-quit', '--logout', '--no-prompt']);
        });

        this.connect('notify::checked', () => {
            if (this._syncingChecked)
                return;

            this._settings.set_boolean('show-topbar', this.checked);
        });

        this.sync();
    }

    sync() {
        const keepAwake = this._settings.get_boolean('keep-awake');
        const showHostname = this._settings.get_boolean('show-hostname');
        const showTopBar = this._settings.get_boolean('show-topbar');
        const showQuickSettings = this._settings.get_boolean('show-quick-settings');
        const hideFullscreen = this._settings.get_boolean('hide-topbar-fullscreen');
        const hideFullscreenAllMonitors = this._settings.get_boolean('hide-topbar-fullscreen-all-monitors');
        const hideMaximized = this._settings.get_boolean('hide-topbar-maximized');
        const hideTouching = this._settings.get_boolean('hide-topbar-touching');
        const displayName = this._extension._getDisplayName();

        this.title = displayName;
        this._syncingChecked = true;
        this.checked = showTopBar;
        this._syncingChecked = false;
        this.menu.setHeader(
            'avatar-default-symbolic',
            displayName,
            showTopBar ? 'Shown in top bar' : 'Hidden from top bar'
        );

        if (this._keepAwakeItem.state !== keepAwake)
            this._keepAwakeItem.setToggleState(keepAwake);

        if (this._showHostnameItem.state !== showHostname)
            this._showHostnameItem.setToggleState(showHostname);

        if (this._showQuickSettingsItem.state !== showQuickSettings)
            this._showQuickSettingsItem.setToggleState(showQuickSettings);

        if (this._hideFullscreenItem.state !== hideFullscreen)
            this._hideFullscreenItem.setToggleState(hideFullscreen);

        if (this._hideFullscreenAllMonitorsItem.state !== hideFullscreenAllMonitors)
            this._hideFullscreenAllMonitorsItem.setToggleState(hideFullscreenAllMonitors);

        if (this._hideMaximizedItem.state !== hideMaximized)
            this._hideMaximizedItem.setToggleState(hideMaximized);

        if (this._hideTouchingItem.state !== hideTouching)
            this._hideTouchingItem.setToggleState(hideTouching);
    }

    destroy() {
        if (this._keepAwakeToggledId) {
            this._keepAwakeItem.disconnect(this._keepAwakeToggledId);
            this._keepAwakeToggledId = null;
        }

        if (this._showHostnameToggledId) {
            this._showHostnameItem.disconnect(this._showHostnameToggledId);
            this._showHostnameToggledId = null;
        }

        if (this._showQuickSettingsToggledId) {
            this._showQuickSettingsItem.disconnect(this._showQuickSettingsToggledId);
            this._showQuickSettingsToggledId = null;
        }

        if (this._hideFullscreenToggledId) {
            this._hideFullscreenItem.disconnect(this._hideFullscreenToggledId);
            this._hideFullscreenToggledId = null;
        }

        if (this._hideFullscreenAllMonitorsToggledId) {
            this._hideFullscreenAllMonitorsItem.disconnect(this._hideFullscreenAllMonitorsToggledId);
            this._hideFullscreenAllMonitorsToggledId = null;
        }

        if (this._hideMaximizedToggledId) {
            this._hideMaximizedItem.disconnect(this._hideMaximizedToggledId);
            this._hideMaximizedToggledId = null;
        }

        if (this._hideTouchingToggledId) {
            this._hideTouchingItem.disconnect(this._hideTouchingToggledId);
            this._hideTouchingToggledId = null;
        }

        super.destroy();
    }
});

const UserQuickIndicator = GObject.registerClass(
class UserQuickIndicator extends QuickSettings.SystemIndicator {
    _init(extension) {
        super._init();

        this._toggle = new UserQuickToggle(extension);
        this.quickSettingsItems.push(this._toggle);
    }

    sync() {
        this._toggle?.sync();
    }

    destroy() {
        this.quickSettingsItems.forEach(item => item.destroy());
        this.quickSettingsItems = [];
        this._toggle = null;
        super.destroy();
    }
});

const UserTopMenuButton = GObject.registerClass(
class UserTopMenuButton extends PanelMenu.Button {
    _init(settings) {
        super._init(0.0, 'Username Avatar Top Menu', false);

        this._settings = settings;
        this._userName = GLib.get_user_name();
        this._realName = GLib.get_real_name();
        this._hostname = GLib.get_host_name();

        this._box = new St.BoxLayout({
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._box.spacing = 0;

        this._avatarFrame = this._createAvatarActor(this._userName);
        this._avatarFrame.set_size(AVATAR_SIZE, AVATAR_SIZE);

        this._label = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._avatarLabelSpacer = new St.Widget({
            width: 6,
        });

        this._hostnameIcon = new St.Icon({
            icon_name: 'computer-symbolic',
            icon_size: 12,
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        this._hostnameTextSpacer = new St.Widget({
            width: 4,
            visible: false,
        });
        this._hostnameLabel = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._labelHostnameSpacer = new St.Widget({
            width: 12,
            visible: false,
        });
        this._hostnameStateSpacer = new St.Widget({
            width: 8,
            visible: false,
        });
        this._stateIconsBox = new St.BoxLayout({
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        this._stateIconsBox.spacing = 6;

        this._fullscreenIcon = new St.Icon({
            icon_name: 'view-fullscreen-symbolic',
            style_class: 'user-topmenu-autohide-icon',
            visible: false,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._stateIcon = new St.Icon({
            icon_name: 'weather-clear-symbolic',
            style_class: 'user-topmenu-state-icon',
            visible: false,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._stateIconsBox.add_child(this._fullscreenIcon);
        this._stateIconsBox.add_child(this._stateIcon);

        this._box.add_child(this._avatarFrame);
        this._box.add_child(this._avatarLabelSpacer);
        this._box.add_child(this._label);
        this._box.add_child(this._labelHostnameSpacer);
        this._box.add_child(this._hostnameIcon);
        this._box.add_child(this._hostnameTextSpacer);
        this._box.add_child(this._hostnameLabel);
        this._box.add_child(this._hostnameStateSpacer);
        this._box.add_child(this._stateIconsBox);
        this.add_child(this._box);

        this._nameItem = new PopupMenu.PopupMenuItem(this._buildLabel(), {
            reactive: false,
            can_focus: false,
        });
        this.menu.addMenuItem(this._nameItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._keepAwakeItem = new PopupMenu.PopupSwitchMenuItem(
            'Keep awake',
            this._settings.get_boolean('keep-awake')
        );
        this._keepAwakeToggledId = this._keepAwakeItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('keep-awake', state);
        });
        this.menu.addMenuItem(this._keepAwakeItem);

        this._showTopBarItem = new PopupMenu.PopupSwitchMenuItem(
            'Show in top bar',
            this._settings.get_boolean('show-topbar')
        );
        this._showTopBarToggledId = this._showTopBarItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('show-topbar', state);
        });
        this.menu.addMenuItem(this._showTopBarItem);

        this._showHostnameItem = new PopupMenu.PopupSwitchMenuItem(
            'Show computer name',
            this._settings.get_boolean('show-hostname')
        );
        this._showHostnameToggledId = this._showHostnameItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('show-hostname', state);
        });
        this.menu.addMenuItem(this._showHostnameItem);

        this._showQuickSettingsItem = new PopupMenu.PopupSwitchMenuItem(
            'Show in quick settings',
            this._settings.get_boolean('show-quick-settings')
        );
        this._showQuickSettingsToggledId = this._showQuickSettingsItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('show-quick-settings', state);
        });
        this.menu.addMenuItem(this._showQuickSettingsItem);

        this._hideFullscreenItem = new PopupMenu.PopupSwitchMenuItem(
            'Hide in fullscreen',
            this._settings.get_boolean('hide-topbar-fullscreen')
        );
        this._hideFullscreenToggledId = this._hideFullscreenItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('hide-topbar-fullscreen', state);
        });
        this.menu.addMenuItem(this._hideFullscreenItem);

        this._hideFullscreenAllMonitorsItem = new PopupMenu.PopupSwitchMenuItem(
            'Fullscreen on all monitors',
            this._settings.get_boolean('hide-topbar-fullscreen-all-monitors')
        );
        this._hideFullscreenAllMonitorsToggledId = this._hideFullscreenAllMonitorsItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('hide-topbar-fullscreen-all-monitors', state);
        });
        this.menu.addMenuItem(this._hideFullscreenAllMonitorsItem);

        this._hideMaximizedItem = new PopupMenu.PopupSwitchMenuItem(
            'Hide when maximized',
            this._settings.get_boolean('hide-topbar-maximized')
        );
        this._hideMaximizedToggledId = this._hideMaximizedItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('hide-topbar-maximized', state);
        });
        this.menu.addMenuItem(this._hideMaximizedItem);

        this._hideTouchingItem = new PopupMenu.PopupSwitchMenuItem(
            'Hide when touching top bar',
            this._settings.get_boolean('hide-topbar-touching')
        );
        this._hideTouchingToggledId = this._hideTouchingItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('hide-topbar-touching', state);
        });
        this.menu.addMenuItem(this._hideTouchingItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction('Lock Screen', () => {
            Util.spawn(['loginctl', 'lock-session']);
        });

        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (key === 'show-hostname')
                this._refreshLabel();

            if (key === 'keep-awake')
                this._syncKeepAwakeState();

            if (key === 'show-topbar')
                this._syncTopBarState();

            if (key === 'show-quick-settings')
                this._syncShowQuickSettingsState();

            if (key === 'hide-topbar-fullscreen' || key === 'hide-topbar-fullscreen-all-monitors' ||
                key === 'hide-topbar-maximized' || key === 'hide-topbar-touching')
                this._syncAutohideState();
        });

        this._refreshLabel();
        this._syncKeepAwakeState();
        this._syncTopBarState();
        this._syncShowQuickSettingsState();
        this._syncAutohideState();
    }

    _createAvatarActor(userName) {
        const avatarPath = `/var/lib/AccountsService/icons/${userName}`;

        if (GLib.file_test(avatarPath, GLib.FileTest.EXISTS)) {
            return new St.Icon({
                gicon: new Gio.FileIcon({file: Gio.File.new_for_path(avatarPath)}),
                icon_size: AVATAR_SIZE,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
        }

        return new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            child: new St.Icon({
                gicon: new Gio.ThemedIcon({name: 'avatar-default-symbolic'}),
                icon_size: AVATAR_SIZE,
                y_align: Clutter.ActorAlign.CENTER,
            }),
        });
    }

    _getDisplayName() {
        return this._realName && this._realName !== 'Unknown' ? this._realName : this._userName;
    }

    _buildLabel() {
        let label = this._getDisplayName();

        if (this._settings.get_boolean('show-hostname'))
            label += ` on ${this._hostname}`;

        return label;
    }

    _refreshLabel() {
        const displayName = this._getDisplayName();
        const showHostname = this._settings.get_boolean('show-hostname');

        this._label.set_text(displayName);
        this._labelHostnameSpacer.visible = showHostname;
        this._hostnameIcon.visible = showHostname;
        this._hostnameTextSpacer.visible = showHostname;
        this._hostnameLabel.set_text(showHostname ? this._hostname : '');
        this._nameItem.label.set_text(this._buildLabel());

        if (this._showHostnameItem.state !== showHostname)
            this._showHostnameItem.setToggleState(showHostname);
    }

    _syncKeepAwakeState() {
        const keepAwake = this._settings.get_boolean('keep-awake');
        this._stateIcon.visible = keepAwake;
        this._stateIconsBox.visible = keepAwake || this._isAutohideEnabled();
        this._hostnameStateSpacer.visible = this._stateIconsBox.visible;
        this._stateIcon.remove_style_pseudo_class('active');

        if (keepAwake)
            this._stateIcon.add_style_pseudo_class('active');

        if (this._keepAwakeItem.state !== keepAwake)
            this._keepAwakeItem.setToggleState(keepAwake);

        this._keepAwakeItem.label.remove_style_pseudo_class('active');
        if (keepAwake)
            this._keepAwakeItem.label.add_style_pseudo_class('active');
    }

    _syncTopBarState() {
        const showTopBar = this._settings.get_boolean('show-topbar');

        if (this._showTopBarItem.state !== showTopBar)
            this._showTopBarItem.setToggleState(showTopBar);
    }

    _syncShowQuickSettingsState() {
        const showQuickSettings = this._settings.get_boolean('show-quick-settings');

        if (this._showQuickSettingsItem.state !== showQuickSettings)
            this._showQuickSettingsItem.setToggleState(showQuickSettings);
    }

    _isAutohideEnabled() {
        return this._settings.get_boolean('hide-topbar-fullscreen') ||
            this._settings.get_boolean('hide-topbar-fullscreen-all-monitors') ||
            this._settings.get_boolean('hide-topbar-maximized') ||
            this._settings.get_boolean('hide-topbar-touching');
    }

    _syncAutohideState() {
        const hideFullscreen = this._settings.get_boolean('hide-topbar-fullscreen');
        const hideFullscreenAllMonitors = this._settings.get_boolean('hide-topbar-fullscreen-all-monitors');
        const hideMaximized = this._settings.get_boolean('hide-topbar-maximized');
        const hideTouching = this._settings.get_boolean('hide-topbar-touching');
        const autohideEnabled = hideFullscreen || hideFullscreenAllMonitors || hideMaximized || hideTouching;

        this._fullscreenIcon.visible = autohideEnabled;
        this._stateIconsBox.visible = autohideEnabled || this._settings.get_boolean('keep-awake');
        this._hostnameStateSpacer.visible = this._stateIconsBox.visible;

        if (this._hideFullscreenItem.state !== hideFullscreen)
            this._hideFullscreenItem.setToggleState(hideFullscreen);

        if (this._hideFullscreenAllMonitorsItem.state !== hideFullscreenAllMonitors)
            this._hideFullscreenAllMonitorsItem.setToggleState(hideFullscreenAllMonitors);

        if (this._hideMaximizedItem.state !== hideMaximized)
            this._hideMaximizedItem.setToggleState(hideMaximized);

        if (this._hideTouchingItem.state !== hideTouching)
            this._hideTouchingItem.setToggleState(hideTouching);
    }

    destroy() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        if (this._keepAwakeToggledId) {
            this._keepAwakeItem.disconnect(this._keepAwakeToggledId);
            this._keepAwakeToggledId = null;
        }

        if (this._showTopBarToggledId) {
            this._showTopBarItem.disconnect(this._showTopBarToggledId);
            this._showTopBarToggledId = null;
        }

        if (this._showHostnameToggledId) {
            this._showHostnameItem.disconnect(this._showHostnameToggledId);
            this._showHostnameToggledId = null;
        }

        if (this._showQuickSettingsToggledId) {
            this._showQuickSettingsItem.disconnect(this._showQuickSettingsToggledId);
            this._showQuickSettingsToggledId = null;
        }

        if (this._hideFullscreenToggledId) {
            this._hideFullscreenItem.disconnect(this._hideFullscreenToggledId);
            this._hideFullscreenToggledId = null;
        }

        if (this._hideFullscreenAllMonitorsToggledId) {
            this._hideFullscreenAllMonitorsItem.disconnect(this._hideFullscreenAllMonitorsToggledId);
            this._hideFullscreenAllMonitorsToggledId = null;
        }

        if (this._hideMaximizedToggledId) {
            this._hideMaximizedItem.disconnect(this._hideMaximizedToggledId);
            this._hideMaximizedToggledId = null;
        }

        if (this._hideTouchingToggledId) {
            this._hideTouchingItem.disconnect(this._hideTouchingToggledId);
            this._hideTouchingToggledId = null;
        }

        super.destroy();
    }
});

export default class UsernameAvatarExtension extends Extension {
    enable() {
        if (this._settings)
            return;

        this._settings = this.getSettings();
        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (key === 'keep-awake')
                this._syncInhibitor();

            if (key === 'place-after-navigation')
                this._rebuildButton();

            if (key === 'show-hostname' || key === 'keep-awake' || key === 'show-topbar' || key === 'show-quick-settings' ||
                key === 'hide-topbar-fullscreen' || key === 'hide-topbar-fullscreen-all-monitors' ||
                key === 'hide-topbar-maximized' || key === 'hide-topbar-touching')
                this._refreshQuickSettingsMenu();

            if (key === 'show-topbar')
                this._rebuildButton();

            if (key === 'show-quick-settings') {
                this._removeQuickSettingsMenu();
                this._addQuickSettingsMenu();
            }

            if (key === 'hide-topbar-fullscreen' || key === 'hide-topbar-fullscreen-all-monitors' ||
                key === 'hide-topbar-maximized' || key === 'hide-topbar-touching')
                this._syncFullscreenPanelVisibility();
        });
        this._fullscreenChangedId = global.display.connect('in-fullscreen-changed', () => {
            this._syncFullscreenPanelVisibility();
        });
        this._focusWindowChangedId = global.display.connect('notify::focus-window', () => {
            this._trackFocusWindow();
            this._syncFullscreenPanelVisibility();
        });

        this._trackFocusWindow();
        this._rebuildButton();
        this._addQuickSettingsMenu();
        this._refreshQuickSettingsMenu();
        this._syncInhibitor();
        this._syncFullscreenPanelVisibility();
    }

    disable() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        if (this._fullscreenChangedId) {
            global.display.disconnect(this._fullscreenChangedId);
            this._fullscreenChangedId = null;
        }

        if (this._focusWindowChangedId) {
            global.display.disconnect(this._focusWindowChangedId);
            this._focusWindowChangedId = null;
        }

        this._disconnectFocusWindowSignals();

        this._releaseInhibitor();
        this._setPanelAutohide(false);
        this._removeQuickSettingsMenu();
        this._button?.destroy();
        this._button = null;
        this._settings = null;
    }

    _rebuildButton() {
        this._button?.destroy();
        this._button = null;

        if (!this._settings.get_boolean('show-topbar'))
            return;

        this._button = new UserTopMenuButton(this._settings);
        Main.panel.addToStatusArea(this.uuid, this._button, this._getPanelPosition(), 'left');
    }

    _getPanelPosition() {
        let position = 1;

        if (!this._settings.get_boolean('place-after-navigation'))
            return position;

        if (Main.panel.statusArea['apps-menu'])
            position += 1;

        if (Main.panel.statusArea['places-menu'])
            position += 1;

        return position;
    }

    _syncInhibitor() {
        if (this._settings.get_boolean('keep-awake'))
            this._inhibitIdle();
        else
            this._releaseInhibitor();
    }

    _inhibitIdle() {
        if (this._inhibitCookie)
            return;

        try {
            const result = Gio.DBus.session.call_sync(
                'org.gnome.SessionManager',
                '/org/gnome/SessionManager',
                'org.gnome.SessionManager',
                'Inhibit',
                new GLib.Variant('(susu)', [
                    'Username Avatar Top Menu',
                    0,
                    'Keep awake enabled',
                    INHIBIT_IDLE_FLAG,
                ]),
                new GLib.VariantType('(u)'),
                Gio.DBusCallFlags.NONE,
                -1,
                null
            );
            this._inhibitCookie = result.recursiveUnpack()[0];
        } catch (error) {
            console.error(`Failed to inhibit idle: ${error.message}`);
        }
    }

    _releaseInhibitor() {
        if (!this._inhibitCookie)
            return;

        try {
            Gio.DBus.session.call_sync(
                'org.gnome.SessionManager',
                '/org/gnome/SessionManager',
                'org.gnome.SessionManager',
                'Uninhibit',
                new GLib.Variant('(u)', [this._inhibitCookie]),
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null
            );
        } catch (error) {
            console.error(`Failed to release idle inhibitor: ${error.message}`);
        } finally {
            this._inhibitCookie = null;
        }
    }

    _getDisplayName() {
        const realName = GLib.get_real_name();
        const userName = GLib.get_user_name();
        return realName && realName !== 'Unknown' ? realName : userName;
    }

    _isFocusWindowFullscreen() {
        if (!this._focusWindow?.fullscreen)
            return false;

        if (this._settings?.get_boolean('hide-topbar-fullscreen-all-monitors'))
            return true;

        return this._focusWindow.get_monitor?.() === global.display.get_primary_monitor();
    }

    _isFocusWindowMaximized() {
        return this._focusWindow?.is_maximized() ?? false;
    }

    _isFocusWindowTouchingTopBar() {
        if (!this._focusWindow)
            return false;

        const frameRect = this._focusWindow.get_frame_rect?.();
        if (!frameRect)
            return false;

        return frameRect.y <= Main.layoutManager.panelBox.height;
    }

    _trackFocusWindow() {
        this._disconnectFocusWindowSignals();
        this._focusWindow = global.display.focus_window;

        if (!this._focusWindow)
            return;

        this._focusWindowSignalIds = [
            this._focusWindow.connect('notify::maximized-horizontally', () => {
                this._syncFullscreenPanelVisibility();
            }),
            this._focusWindow.connect('notify::maximized-vertically', () => {
                this._syncFullscreenPanelVisibility();
            }),
            this._focusWindow.connect('notify::fullscreen', () => {
                this._syncFullscreenPanelVisibility();
            }),
            this._focusWindow.connect('position-changed', () => {
                this._syncFullscreenPanelVisibility();
            }),
            this._focusWindow.connect('size-changed', () => {
                this._syncFullscreenPanelVisibility();
            }),
        ];
    }

    _disconnectFocusWindowSignals() {
        if (!this._focusWindow || !this._focusWindowSignalIds)
            return;

        for (const signalId of this._focusWindowSignalIds)
            this._focusWindow.disconnect(signalId);

        this._focusWindowSignalIds = null;
        this._focusWindow = null;
    }

    _syncFullscreenPanelVisibility() {
        const hideFullscreen = this._settings?.get_boolean('hide-topbar-fullscreen');
        const hideMaximized = this._settings?.get_boolean('hide-topbar-maximized');
        const hideTouching = this._settings?.get_boolean('hide-topbar-touching');
        const shouldHide =
            (hideFullscreen && this._isFocusWindowFullscreen()) ||
            (hideMaximized && this._isFocusWindowMaximized()) ||
            (hideTouching && this._isFocusWindowTouchingTopBar());

        this._setPanelAutohide(shouldHide);
    }

    _setPanelAutohide(hidden) {
        const panelBox = Main.layoutManager.panelBox;

        if (!panelBox)
            return;

        if (hidden) {
            if (!this._panelUntracked) {
                Main.layoutManager.untrackChrome(panelBox);
                this._panelUntracked = true;
            }

            panelBox.visible = false;
        } else {
            panelBox.visible = true;

            if (this._panelUntracked) {
                Main.layoutManager.trackChrome(panelBox, {affectsStruts: true});
                this._panelUntracked = false;
            }
        }

        Main.layoutManager._queueUpdateRegions?.();
    }

    _addQuickSettingsMenu() {
        const quickSettings = Main.panel.statusArea.quickSettings;

        this._removeQuickSettingsMenu();

        if (!quickSettings || !this._settings.get_boolean('show-quick-settings'))
            return;

        this._quickIndicator = new UserQuickIndicator(this);
        quickSettings.addExternalIndicator(this._quickIndicator);
    }

    _refreshQuickSettingsMenu() {
        this._quickIndicator?.sync();
    }

    _removeQuickSettingsMenu() {
        this._quickIndicator?.destroy();
        this._quickIndicator = null;
    }
}
