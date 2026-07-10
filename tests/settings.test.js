import assert from 'node:assert/strict';
import test from 'node:test';

import {readSharedMenuState} from '../lib/settings.js';

function mockSettings(values) {
    return {
        get_boolean(key) {
            return Boolean(values[key]);
        },
        get_string(key) {
            return values[key] ?? '';
        },
    };
}

test('derives synchronized menu state and fullscreen dependency', () => {
    const extension = mockSettings({
        'show-topbar': true,
        'show-hostname': false,
        'show-username': true,
        'show-avatar': true,
        'show-quick-settings': true,
        'hide-topbar-fullscreen': false,
        'hide-topbar-fullscreen-all-monitors': true,
        'hide-topbar-maximized': false,
        'hide-topbar-touching': false,
    });
    const state = readSharedMenuState(
        extension,
        mockSettings({'gtk-enable-primary-paste': true}),
        mockSettings({'tap-button-map': 'lrm'})
    );
    assert.equal(state._showTopBarItem, true);
    assert.equal(state._primaryPasteItem, true);
    assert.equal(state._touchpadMiddleClickItem, true);
    assert.equal(state.fullscreenAllMonitorsSensitive, false);
});
