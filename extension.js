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

        this._hideFullscreenItem = new PopupMenu.PopupSwitchMenuItem(
            'Hide top bar in fullscreen',
            this._settings.get_boolean('hide-topbar-fullscreen')
        );
        this._hideFullscreenToggledId = this._hideFullscreenItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('hide-topbar-fullscreen', state);
        });
        this.menu.addMenuItem(this._hideFullscreenItem);

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

        this.connect('clicked', () => {
            this._settings.set_boolean('show-topbar', this.checked);
        });

        this.sync();
    }

    sync() {
        const keepAwake = this._settings.get_boolean('keep-awake');
        const showHostname = this._settings.get_boolean('show-hostname');
        const showTopBar = this._settings.get_boolean('show-topbar');
        const hideFullscreen = this._settings.get_boolean('hide-topbar-fullscreen');
        const displayName = this._extension._getDisplayName();

        this.title = displayName;
        this.checked = showTopBar;
        this.menu.setHeader(
            'avatar-default-symbolic',
            displayName,
            showTopBar ? 'Shown in top bar' : 'Hidden from top bar'
        );

        if (this._keepAwakeItem.state !== keepAwake)
            this._keepAwakeItem.setToggleState(keepAwake);

        if (this._showHostnameItem.state !== showHostname)
            this._showHostnameItem.setToggleState(showHostname);

        if (this._hideFullscreenItem.state !== hideFullscreen)
            this._hideFullscreenItem.setToggleState(hideFullscreen);
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

        if (this._hideFullscreenToggledId) {
            this._hideFullscreenItem.disconnect(this._hideFullscreenToggledId);
            this._hideFullscreenToggledId = null;
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

        this._stateIcon = new St.Icon({
            icon_name: 'weather-clear-symbolic',
            style_class: 'user-topmenu-state-icon',
            visible: false,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._box.add_child(this._avatarFrame);
        this._box.add_child(this._avatarLabelSpacer);
        this._box.add_child(this._label);
        this._box.add_child(this._labelHostnameSpacer);
        this._box.add_child(this._hostnameIcon);
        this._box.add_child(this._hostnameTextSpacer);
        this._box.add_child(this._hostnameLabel);
        this._box.add_child(this._hostnameStateSpacer);
        this._box.add_child(this._stateIcon);
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

        this._hideFullscreenItem = new PopupMenu.PopupSwitchMenuItem(
            'Hide top bar in fullscreen',
            this._settings.get_boolean('hide-topbar-fullscreen')
        );
        this._hideFullscreenToggledId = this._hideFullscreenItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('hide-topbar-fullscreen', state);
        });
        this.menu.addMenuItem(this._hideFullscreenItem);
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

            if (key === 'hide-topbar-fullscreen')
                this._syncHideFullscreenState();
        });

        this._refreshLabel();
        this._syncKeepAwakeState();
        this._syncTopBarState();
        this._syncHideFullscreenState();
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
        this._hostnameStateSpacer.visible = keepAwake;
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

    _syncHideFullscreenState() {
        const hideFullscreen = this._settings.get_boolean('hide-topbar-fullscreen');

        if (this._hideFullscreenItem.state !== hideFullscreen)
            this._hideFullscreenItem.setToggleState(hideFullscreen);
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

        if (this._hideFullscreenToggledId) {
            this._hideFullscreenItem.disconnect(this._hideFullscreenToggledId);
            this._hideFullscreenToggledId = null;
        }

        super.destroy();
    }
});

export default class UsernameAvatarExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (key === 'keep-awake')
                this._syncInhibitor();

            if (key === 'place-after-navigation')
                this._rebuildButton();

            if (key === 'show-hostname' || key === 'keep-awake' || key === 'show-topbar' || key === 'hide-topbar-fullscreen')
                this._refreshQuickSettingsMenu();

            if (key === 'show-topbar')
                this._rebuildButton();

            if (key === 'hide-topbar-fullscreen')
                this._syncFullscreenPanelVisibility();
        });
        this._fullscreenChangedId = global.display.connect('in-fullscreen-changed', () => {
            this._syncFullscreenPanelVisibility();
        });

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

        this._releaseInhibitor();
        Main.layoutManager.panelBox.visible = true;
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

    _isAnyMonitorFullscreen() {
        const monitorCount = global.display.get_n_monitors();

        for (let i = 0; i < monitorCount; i++) {
            if (global.display.get_monitor_in_fullscreen(i))
                return true;
        }

        return false;
    }

    _syncFullscreenPanelVisibility() {
        const hideFullscreen = this._settings?.get_boolean('hide-topbar-fullscreen');
        const shouldHide = hideFullscreen && this._isAnyMonitorFullscreen();

        Main.layoutManager.panelBox.visible = !shouldHide;
    }

    _addQuickSettingsMenu() {
        const quickSettings = Main.panel.statusArea.quickSettings;

        if (!quickSettings)
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
