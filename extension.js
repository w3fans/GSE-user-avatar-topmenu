import St from 'gi://St';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const AVATAR_SIZE = 24;

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

        this._avatar = new St.Icon({
            gicon: this._getAvatarIcon(this._userName),
            style_class: 'user-topmenu-avatar',
            icon_size: AVATAR_SIZE,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._label = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._box.add_child(this._avatar);
        this._box.add_child(this._label);
        this.add_child(this._box);

        this._nameItem = new PopupMenu.PopupMenuItem(this._buildLabel(), {
            reactive: false,
            can_focus: false,
        });
        this.menu.addMenuItem(this._nameItem);

        this._settingsChangedId = this._settings.connect('changed::show-hostname', () => {
            this._refreshLabel();
        });

        this._refreshLabel();
    }

    _getAvatarIcon(userName) {
        const avatarPath = `/var/lib/AccountsService/icons/${userName}`;

        if (GLib.file_test(avatarPath, GLib.FileTest.EXISTS))
            return new Gio.FileIcon({file: Gio.File.new_for_path(avatarPath)});

        return new Gio.ThemedIcon({name: 'avatar-default-symbolic'});
    }

    _getDisplayName() {
        return this._realName && this._realName !== 'Unknown' ? this._realName : this._userName;
    }

    _buildLabel() {
        let label = this._getDisplayName();

        if (this._settings.get_boolean('show-hostname'))
            label += ` at ${this._hostname}`;

        return label;
    }

    _refreshLabel() {
        const label = this._buildLabel();
        this._label.set_text(label);
        this._nameItem.label.set_text(label);
    }

    destroy() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        super.destroy();
    }
});

export default class UsernameAvatarExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._button = new UserTopMenuButton(this._settings);
        Main.panel.addToStatusArea(this.uuid, this._button, 1, 'left');
    }

    disable() {
        this._button?.destroy();
        this._button = null;
        this._settings = null;
    }
}
