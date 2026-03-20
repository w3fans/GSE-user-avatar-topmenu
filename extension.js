import St from 'gi://St';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const AVATAR_SIZE = 24;
const INHIBIT_IDLE_FLAG = 8;

const UserTopMenuButton = GObject.registerClass(
class UserTopMenuButton extends PanelMenu.Button {
    _init(settings) {
        super._init(0.0, 'Username Avatar Top Menu', false);

        this._settings = settings;
        this._userName = GLib.get_user_name();
        this._realName = GLib.get_real_name();
        this._hostname = GLib.get_host_name();

        this._box = new St.BoxLayout({
            style_class: 'user-topmenu-box',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._avatarFrame = this._createAvatarActor(this._userName);

        this._label = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._hostnameIcon = new St.Icon({
            icon_name: 'computer-symbolic',
            style_class: 'user-topmenu-host-icon',
            icon_size: 12,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._hostnameBox = new St.BoxLayout({
            style_class: 'user-topmenu-host-box',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._hostnameBox.add_child(this._hostnameIcon);

        this._stateIcon = new St.Icon({
            icon_name: 'weather-clear-symbolic',
            style_class: 'user-topmenu-state-icon',
            visible: false,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._box.add_child(this._avatarFrame);
        this._box.add_child(this._label);
        this._box.add_child(this._hostnameBox);
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

        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (key === 'show-hostname')
                this._refreshLabel();

            if (key === 'keep-awake')
                this._syncKeepAwakeState();

            if (key === 'show-topbar')
                this._syncTopBarState();
        });

        this._refreshLabel();
        this._syncKeepAwakeState();
        this._syncTopBarState();
    }

    _createAvatarActor(userName) {
        const avatarPath = `/var/lib/AccountsService/icons/${userName}`;

        if (GLib.file_test(avatarPath, GLib.FileTest.EXISTS)) {
            return new St.Bin({
                style_class: 'user-topmenu-avatar-frame',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                style: `
                    background-image: url("file://${avatarPath}");
                    background-size: cover;
                    background-position: center;
                `,
            });
        }

        return new St.Bin({
            style_class: 'user-topmenu-avatar-frame',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            child: new St.Icon({
                gicon: new Gio.ThemedIcon({name: 'avatar-default-symbolic'}),
                style_class: 'user-topmenu-avatar',
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
        this._hostnameBox.opacity = showHostname ? 255 : 0;
        this._nameItem.label.set_text(this._buildLabel());
    }

    _syncKeepAwakeState() {
        const keepAwake = this._settings.get_boolean('keep-awake');
        this._stateIcon.visible = keepAwake;
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

            if (key === 'show-hostname')
                this._refreshQuickSettingsMenu();

            if (key === 'show-topbar')
                this._rebuildButton();
        });

        this._rebuildButton();
        this._addQuickSettingsMenu();
        this._syncInhibitor();
    }

    disable() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        this._releaseInhibitor();
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

    _addQuickSettingsMenu() {
        const quickSettings = Main.panel.statusArea.quickSettings;

        if (!quickSettings?.menu)
            return;

        this._quickSettingsItem = new PopupMenu.PopupSubMenuMenuItem(this._getDisplayName(), true);
        this._quickSettingsItem.icon.icon_name = 'avatar-default-symbolic';

        this._quickKeepAwakeItem = new PopupMenu.PopupSwitchMenuItem(
            'Keep awake',
            this._settings.get_boolean('keep-awake')
        );
        this._quickKeepAwakeToggledId = this._quickKeepAwakeItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('keep-awake', state);
        });
        this._quickSettingsItem.menu.addMenuItem(this._quickKeepAwakeItem);
        this._quickSettingsItem.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._quickSettingsItem.menu.addAction('Open Preferences', () => {
            this.openPreferences();
        });
        this._quickSettingsItem.menu.addAction('Log Out', () => {
            Util.spawn(['gnome-session-quit', '--logout', '--no-prompt']);
        });

        this._quickSettingsSeparator = new PopupMenu.PopupSeparatorMenuItem();
        quickSettings.menu.addMenuItem(this._quickSettingsSeparator);
        quickSettings.menu.addMenuItem(this._quickSettingsItem);
    }

    _refreshQuickSettingsMenu() {
        this._quickSettingsItem?.label.set_text(this._getDisplayName());
        if (this._quickKeepAwakeItem &&
            this._quickKeepAwakeItem.state !== this._settings.get_boolean('keep-awake'))
            this._quickKeepAwakeItem.setToggleState(this._settings.get_boolean('keep-awake'));
    }

    _removeQuickSettingsMenu() {
        if (this._quickKeepAwakeToggledId) {
            this._quickKeepAwakeItem.disconnect(this._quickKeepAwakeToggledId);
            this._quickKeepAwakeToggledId = null;
        }

        this._quickSettingsItem?.destroy();
        this._quickSettingsItem = null;
        this._quickKeepAwakeItem = null;
        this._quickSettingsSeparator?.destroy();
        this._quickSettingsSeparator = null;
    }
}
