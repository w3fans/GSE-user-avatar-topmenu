export const SHARED_MENU_SETTINGS = Object.freeze([
    {property: '_showTopBarItem', key: 'show-topbar'},
    {property: '_showHostnameItem', key: 'show-hostname'},
    {property: '_showUsernameItem', key: 'show-username'},
    {property: '_showAvatarItem', key: 'show-avatar'},
    {property: '_showQuickSettingsItem', key: 'show-quick-settings'},
    {property: '_hideFullscreenItem', key: 'hide-topbar-fullscreen'},
    {property: '_hideFullscreenAllMonitorsItem', key: 'hide-topbar-fullscreen-all-monitors'},
    {property: '_hideMaximizedItem', key: 'hide-topbar-maximized'},
    {property: '_hideTouchingItem', key: 'hide-topbar-touching'},
]);

export function readSharedMenuState(settings, desktopSettings, touchpadSettings) {
    const state = Object.fromEntries(
        SHARED_MENU_SETTINGS.map(({property, key}) => [property, settings.get_boolean(key)])
    );
    state._primaryPasteItem = desktopSettings.get_boolean('gtk-enable-primary-paste');
    state._touchpadMiddleClickItem = touchpadSettings.get_string('tap-button-map') === 'lrm';
    state.fullscreenAllMonitorsSensitive = state._hideFullscreenItem;
    return state;
}
