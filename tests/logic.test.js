import assert from 'node:assert/strict';
import test from 'node:test';

import {
    calculateCpuUsage,
    calculateEngineUsage,
    calculateMemoryUsage,
    formatBinaryBytes,
    formatTemperature,
    getTemperatureColor,
    parseProcDiskstats,
    parseProcNetDev,
    parseDmiMemory,
    shouldHidePanel,
    timerIsActive,
} from '../lib/logic.js';

test('calculates CPU usage from deltas', () => {
    assert.equal(calculateCpuUsage({idle: 100, total: 200}, {idle: 125, total: 300}), 75);
    assert.equal(calculateCpuUsage(null, {idle: 1, total: 2}), null);
});

test('normalizes nanosecond DRM busy counters against GLib microseconds', () => {
    assert.equal(calculateEngineUsage(
        {busy: 0, time: 1_000_000},
        {busy: 500_000_000, time: 2_000_000}
    ), 50);
});

test('calculates memory and formats binary units', () => {
    assert.deepEqual(calculateMemoryUsage(1000, 250), {used: 750, percent: 75});
    assert.equal(formatBinaryBytes(8 * 1024 ** 3), '8 GiB');
    assert.equal(formatTemperature(50, 'fahrenheit', false), '122°F');
    assert.equal(getTemperatureColor(69, 70, 90), '#f8e45c');
    assert.equal(getTemperatureColor(70, 70, 90), '#ff7800');
    assert.equal(getTemperatureColor(90, 70, 90), '#e01b24');
});

test('uses absolute primary monitor geometry for touching autohide', () => {
    const monitor = {index: 1, y: 1080, panelHeight: 32};
    const options = {fullscreen: false, fullscreenAllMonitors: false, maximized: false, touching: true};
    assert.equal(shouldHidePanel(options, {monitor: 1, y: 1112}, monitor), true);
    assert.equal(shouldHidePanel(options, {monitor: 0, y: 0}, monitor), false);
});

test('timer deadline survives controller reconstruction', () => {
    assert.equal(timerIsActive(true, 2_000_000, 1_000_000), true);
    assert.equal(timerIsActive(true, 2_000_000, 2_000_000), false);
});

test('parses network and disk counters', () => {
    const net = 'Inter-| Receive | Transmit\n face |bytes |bytes\n lo: 5 0 0 0 0 0 0 0 5\n eth0: 100 0 0 0 0 0 0 0 200';
    assert.deepEqual(parseProcNetDev(net), {rx: 100, tx: 200});
    const disk = '8 0 sda 1 0 2 0 1 0 4 0 0 0 0 0\n8 1 sda1 1 0 99 0 1 0 99 0 0 0 0 0\n7 0 loop0 1 0 99 0 1 0 99 0 0 0 0 0';
    assert.deepEqual(parseProcDiskstats(disk), {readBytes: 1024, writeBytes: 2048});
});

test('parses populated DMI memory records only', () => {
    const contents = `Memory Device
    Size: 16 GB
    Locator: DIMM_A1
    Type: DDR5
    Configured Memory Speed: 5600 MT/s
    Part Number: TEST-16G

Memory Device
    Size: No Module Installed
    Locator: DIMM_A2`;
    assert.deepEqual(parseDmiMemory(contents), [{
        type: 'DDR5',
        size: '16 GB',
        locator: 'DIMM_A1',
        speed: '5600 MT/s',
        part: 'TEST-16G',
    }]);
});
