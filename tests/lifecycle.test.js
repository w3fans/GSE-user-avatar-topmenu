import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {InhibitorController} from '../lib/inhibitor.js';
import {shouldHidePanel} from '../lib/logic.js';

test('inhibitor retains failed release cookie, retries, and serializes rapid toggles', async () => {
    let acquired = 0, released = 0, fail = true;
    const c = new InhibitorController(async () => ++acquired, async cookie => {
        assert.equal(cookie, acquired);
        if (fail) { fail = false; throw Error('transient'); }
        released++;
    }, () => {});
    await c.setDesired(true);
    await c.setDesired(false);
    assert.equal(c.cookie, 1);
    c.retryAt = 0;
    await c.reconcile();
    assert.equal(c.cookie, null);
    assert.equal(released, 1);
    const pending = c.setDesired(true);
    c.setDesired(false);
    await pending;
    assert.equal(c.cookie, null);
    assert.equal(acquired, released);
    await c.destroy();
});

test('disable during an outstanding acquisition releases its eventual cookie', async () => {
    let done, released;
    const c = new InhibitorController(() => new Promise(resolve => { done = resolve; }), async cookie => { released = cookie; });
    c.setDesired(true);
    const cleanup = c.destroy();
    done(42);
    await cleanup;
    assert.equal(released, 42);
    assert.equal(c.cookie, null);
});

test('1000 metric samples retain actor identity and focus; removals destroy only removed actors', () => {
    const source = fs.readFileSync(new URL('../extension.js', import.meta.url), 'utf8');
    const method = source.slice(source.indexOf('    _render() {'), source.indexOf('    _getCachedItemsForGroup(group)'));
    const render = new Function('St', `return ${method.trim().replace('_render()', 'function()')};`)({Widget: class {}});
    let destroyed = 0;
    const children = [];
    const view = {
        _box: {add_child: actor => children.push(actor), get_child_at_index: index => children[index],
            set_child_at_index(actor, index) { children.splice(children.indexOf(actor), 1); children.splice(index, 0, actor); }},
        _metricActors: new Map(), _side: 'left',
        _getCachedItemsForGroup(group) { return group === 'loads' ? this.items : []; },
        _createMetricLabel(item) { return {focus: true, destroy() { destroyed++; children.splice(children.indexOf(this), 1); }}; },
        _updateMetric(actor, item) { actor.value = item.percent; },
        _hideTooltip() {}, items: [{type: 'load', id: 'cpu', percent: 0}],
    };
    render.call(view);
    const actor = children[0];
    for (let i = 0; i < 1000; i++) { view.items[0].percent = i; render.call(view); }
    assert.equal(children[0], actor);
    assert.equal(actor.focus, true);
    assert.equal(actor.value, 999);
    assert.equal(destroyed, 0);
    view.items = []; render.call(view);
    assert.equal(destroyed, 1);
});

test('autohide preserves chrome ownership and restores original translation and hover policy', () => {
    const source = fs.readFileSync(new URL('../extension.js', import.meta.url), 'utf8');
    const method = source.slice(source.indexOf('    _setPanelAutohide(hidden)'), source.indexOf('    _schedulePanelHide()'));
    const panel = {translation_y: 17, height: 30, visible: true, track_hover: false, hover: false,
        connectObject() {}, disconnectObject() {}, remove_transition() {}};
    const hide = new Function('Main', `return ${method.trim().replace('_setPanelAutohide(hidden)', 'function(hidden)')};`)(
        {layoutManager: {panelBox: panel}, overview: {visible: false}});
    const owner = {_ensurePanelRevealActor() {}, _destroyPanelRevealActor() { this._panelTemporarilyRevealed = false; }};
    hide.call(owner, true); assert.equal(panel.translation_y, -13);
    panel.hover = true; hide.call(owner, true); assert.equal(panel.translation_y, 17);
    panel.hover = false; hide.call(owner, true); assert.equal(panel.translation_y, -13);
    hide.call(owner, false); assert.equal(panel.translation_y, 17); assert.equal(panel.track_hover, false);
    hide.call(owner, true); panel.translation_y = 9; hide.call(owner, false);
    assert.equal(panel.translation_y, 9);
    assert.equal(panel.visible, true);
});

test('fullscreen autohide follows focus and restores Shell tracking when turned off', () => {
    const source = fs.readFileSync(new URL('../extension.js', import.meta.url), 'utf8');
    const panel = {visible: false, height: 30, show() { this.visible = true; }};
    const primary = {inFullscreen: true, x: 0, y: 0, width: 1920};
    const tracked = {actor: panel, trackFullscreen: true, affectsStruts: true};
    const layoutManager = {
        panelBox: panel, primaryMonitor: primary, _trackedActors: [tracked],
        _updateActorVisibility(entry) {
            if (entry.trackFullscreen)
                entry.actor.visible = !primary.inFullscreen;
        },
    };
    const window = (fullscreen, monitor) => ({fullscreen, get_monitor: () => monitor});
    const display = {focus_window: window(true, 0), get_primary_monitor: () => 0};
    const settings = {'hide-topbar-fullscreen': true};
    const owner = {
        _focusWindow: display.focus_window, // Cached signal owner must not decide visibility.
        _settings: {get_boolean: key => settings[key] ?? false},
        _setPanelAutohide(hidden) { this.hidden = hidden; },
    };
    for (const [name, next] of [
        ['_syncFullscreenPanelVisibility', '_syncNativePanelFullscreen'],
        ['_syncNativePanelFullscreen', '_setPanelAutohide'],
    ]) {
        const body = source.slice(source.indexOf(`    ${name}(`), source.indexOf(`    ${next}(`));
        owner[name] = new Function('Main', 'global', 'shouldHidePanel',
            `return ({${body}}).${name};`)({layoutManager}, {display}, shouldHidePanel);
    }
    const sync = () => owner._syncFullscreenPanelVisibility();
    sync();
    assert.equal(owner.hidden, true);
    assert.equal(tracked.trackFullscreen, false);
    assert.equal(tracked.affectsStruts, true);

    display.focus_window = window(false, 0);
    layoutManager._updateActorVisibility(tracked);
    sync();
    assert.equal(owner.hidden, false);
    assert.equal(panel.visible, true);

    display.focus_window = window(true, 1);
    sync();
    assert.equal(owner.hidden, false);
    settings['hide-topbar-fullscreen-all-monitors'] = true;
    sync();
    assert.equal(owner.hidden, true);
    display.focus_window = null;
    sync();
    assert.equal(owner.hidden, false);

    settings['hide-topbar-fullscreen'] = false;
    sync();
    assert.equal(tracked.trackFullscreen, true);
    assert.equal(panel.visible, false); // The default Shell policy is back.
    assert.equal(owner.hidden, false);
});

test('invalid NVIDIA index never falls through to a different DRM GPU', () => {
    const source = fs.readFileSync(new URL('../extension.js', import.meta.url), 'utf8');
    for (const [name, next, expected] of [
        ['getGpuTemperature', 'getGpuDescription', {temp: null, sensor: 'NVIDIA GPU 7 unavailable'}],
        ['getGpuDescription', 'getCpuTemperature', 'NVIDIA GPU 7 unavailable'],
    ]) {
        const method = source.slice(source.indexOf(`function ${name}(`), source.indexOf(`function ${next}(`));
        const fn = new Function('getGpuByType', 'getNvidiaMetrics', 'getHwmonTemperature', 'getGpuDisplayName',
            `${method}\nreturn ${name};`)(() => ({vendor: '0x10de', path: '/gpu0'}), () => null,
            () => {throw Error('wrong GPU fallback');}, () => {throw Error('wrong GPU description');});
        assert.deepEqual(fn('dgpu', 'auto', 7), expected);
    }
});
