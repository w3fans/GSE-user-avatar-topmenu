import GLib from 'gi://GLib';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {timerRemainingSeconds} from './logic.js';
import {readSharedMenuState, SHARED_MENU_SETTINGS} from './settings.js';

let _ = text => text;

export function configureMenuTranslation(gettext) {
    _ = gettext;
}

export function translate(text) {
    return _(text);
}

function addSettingsSwitch(menu, label, settings, key, owner, options = {}) {
    const item = new PopupMenu.PopupSwitchMenuItem(
        label,
        options.invert ? !settings.get_boolean(key) : settings.get_boolean(key)
    );
    item.connectObject('toggled', (_item, state) => {
        settings.set_boolean(key, options.invert ? !state : state);
    }, owner);
    owner._switchItems?.push(item);
    menu.addMenuItem(item);
    return item;
}

function addCustomSwitch(menu, label, state, owner, callback) {
    const item = new PopupMenu.PopupSwitchMenuItem(label, state);
    item.connectObject('toggled', (_item, nextState) => callback(nextState), owner);
    owner._switchItems?.push(item);
    menu.addMenuItem(item);
    return item;
}

function setTouchpadMiddleClick(extensionSettings, touchpadSettings, state) {
    const current = touchpadSettings.get_string('tap-button-map');
    if (state) {
        if (current !== 'lrm')
            extensionSettings.set_string('touchpad-previous-map', current);
        touchpadSettings.set_string('tap-button-map', 'lrm');
        return;
    }
    const previous = extensionSettings.get_string('touchpad-previous-map');
    touchpadSettings.set_string('tap-button-map', previous || 'default');
    extensionSettings.set_string('touchpad-previous-map', '');
}

export function addKeepAwakeControls(menu, settings, owner) {
    const items = {};
    items.manual = addSettingsSwitch(menu, _('Keep awake'), settings, 'keep-awake', owner);
    items.fullscreen = addSettingsSwitch(
        menu, _('Automatic for fullscreen apps'), settings, 'keep-awake-fullscreen', owner);
    items.media = addSettingsSwitch(
        menu, _('Automatic while media plays'), settings, 'keep-awake-media', owner);
    items.timerMenu = new PopupMenu.PopupSubMenuMenuItem(_('Keep-awake timer'));
    menu.addMenuItem(items.timerMenu);
    items.timerStatus = new PopupMenu.PopupMenuItem(_('Timer inactive'), {
        reactive: false,
        can_focus: false,
    });
    items.timerMenu.menu.addMenuItem(items.timerStatus);
    items.timerMenu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    for (const [minutes, label] of [
        [15, _('15 minutes')],
        [30, _('30 minutes')],
        [60, _('1 hour')],
        [120, _('2 hours')],
    ]) {
        items.timerMenu.menu.addAction(
            label,
            () => {
                settings.set_uint('keep-awake-timer-minutes', minutes);
                settings.set_boolean('keep-awake-timer-active', true);
            }
        );
    }
    items.timerMenu.menu.addAction(_('Cancel timer'), () => {
        settings.set_boolean('keep-awake-timer-active', false);
    });
    return items;
}

export function syncKeepAwakeControls(items, settings) {
    if (!items)
        return;
    for (const [item, state] of [
        [items.manual, settings.get_boolean('keep-awake')],
        [items.fullscreen, settings.get_boolean('keep-awake-fullscreen')],
        [items.media, settings.get_boolean('keep-awake-media')],
    ]) {
        if (item.state !== state)
            item.setToggleState(state);
    }
    const deadline = settings.get_int64('keep-awake-timer-deadline');
    const remaining = timerRemainingSeconds(deadline, GLib.get_real_time());
    const active = settings.get_boolean('keep-awake-timer-active') && remaining > 0;
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.ceil((remaining % 3600) / 60);
    items.timerStatus.label.set_text(active
        ? _('Remaining: %s').replace('%s', `${hours ? `${hours}h ` : ''}${minutes}m`)
        : _('Timer inactive'));
}

export function addSharedMenuSections(owner, menu, includeShowTopBar) {
    const settings = owner._settings;
    const result = {};
    result._displaySubmenu = new PopupMenu.PopupSubMenuMenuItem(_('Display'));
    menu.addMenuItem(result._displaySubmenu);
    if (includeShowTopBar) {
        result._showTopBarItem = addSettingsSwitch(
            result._displaySubmenu.menu, _('Show in top bar'), settings, 'show-topbar', owner);
    }
    result._showHostnameItem = addSettingsSwitch(
        result._displaySubmenu.menu, _('Show computer name'), settings, 'show-hostname', owner);
    result._showUsernameItem = addSettingsSwitch(
        result._displaySubmenu.menu, _('Display name'), settings, 'show-username', owner);
    result._showAvatarItem = addSettingsSwitch(
        result._displaySubmenu.menu, _('Display avatar'), settings, 'show-avatar', owner);

    result._desktopSubmenu = new PopupMenu.PopupSubMenuMenuItem(_('Desktop'));
    menu.addMenuItem(result._desktopSubmenu);
    result._primaryPasteItem = addSettingsSwitch(
        result._desktopSubmenu.menu, _('Enable primary paste'),
        owner._desktopInterfaceSettings, 'gtk-enable-primary-paste', owner);
    result._touchpadMiddleClickItem = addCustomSwitch(
        result._desktopSubmenu.menu, _('Three-finger middle click'),
        owner._touchpadSettings.get_string('tap-button-map') === 'lrm', owner,
        state => setTouchpadMiddleClick(settings, owner._touchpadSettings, state));

    result._behaviorSubmenu = new PopupMenu.PopupSubMenuMenuItem(_('Extension'));
    menu.addMenuItem(result._behaviorSubmenu);
    result._showQuickSettingsItem = addSettingsSwitch(
        result._behaviorSubmenu.menu, _('Show in quick settings'),
        settings, 'show-quick-settings', owner);

    result._autohideSubmenu = new PopupMenu.PopupSubMenuMenuItem(_('Autohide'));
    menu.addMenuItem(result._autohideSubmenu);
    result._hideFullscreenItem = addSettingsSwitch(
        result._autohideSubmenu.menu, _('Hide in fullscreen'),
        settings, 'hide-topbar-fullscreen', owner);
    result._hideFullscreenAllMonitorsItem = addSettingsSwitch(
        result._autohideSubmenu.menu, _('Fullscreen on all monitors'),
        settings, 'hide-topbar-fullscreen-all-monitors', owner);
    result._hideMaximizedItem = addSettingsSwitch(
        result._autohideSubmenu.menu, _('Hide when maximized'),
        settings, 'hide-topbar-maximized', owner);
    result._hideTouchingItem = addSettingsSwitch(
        result._autohideSubmenu.menu, _('Hide when touching top bar'),
        settings, 'hide-topbar-touching', owner);
    return result;
}

export function syncSharedMenuSections(owner) {
    const settings = owner._settings;
    const state = readSharedMenuState(
        settings, owner._desktopInterfaceSettings, owner._touchpadSettings);
    const descriptors = [
        ...SHARED_MENU_SETTINGS,
        {property: '_primaryPasteItem'},
        {property: '_touchpadMiddleClickItem'},
    ];
    for (const {property} of descriptors) {
        const item = owner[property];
        const value = state[property];
        if (item && item.state !== value)
            item.setToggleState(value);
    }
    owner._hideFullscreenAllMonitorsItem.setSensitive(
        state.fullscreenAllMonitorsSensitive);
}
