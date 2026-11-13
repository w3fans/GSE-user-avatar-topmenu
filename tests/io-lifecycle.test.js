import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('100 subprocess lifetime cancellations remove every timeout before late completion', async () => {
    const source = fs.readFileSync(new URL('../lib/io.js', import.meta.url), 'utf8')
        .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
    const timers = new Set(); let next = 0, completion;
    const process = {force_exit() {}, communicate_utf8_async(input, cancel, callback) { completion = callback; },
        communicate_utf8_finish() { throw Error('cancelled'); }};
    const io = new Function('Gio', 'GLib', `${source}\nreturn {runCommandAsync,cancelPendingCommands};`)(
        {Subprocess: {new: () => process}, SubprocessFlags: {STDOUT_PIPE: 1, STDERR_SILENCE: 2}},
        {PRIORITY_DEFAULT: 0, timeout_add() { timers.add(++next); return next; }, Source: {remove(id) { assert(timers.delete(id)); }}}
    );
    for (let i = 0; i < 100; i++) {
        const result = io.runCommandAsync(['test']);
        io.cancelPendingCommands();
        assert.equal(timers.size, 0);
        completion(process, null);
        assert.equal(await result, '');
    }
});
