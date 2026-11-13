import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {InhibitorController} from '../lib/inhibitor.js';

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
