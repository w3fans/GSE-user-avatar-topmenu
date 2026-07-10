import St from 'gi://St';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {dbusCallAsync, runCommandAsync} from './lib/io.js';
import {
    addKeepAwakeControls,
    addSharedMenuSections,
    configureMenuTranslation,
    syncKeepAwakeControls,
    syncSharedMenuSections,
    translate,
} from './lib/menu.js';
import {
    calculateCpuUsage,
    calculateEngineUsage,
    calculateMemoryUsage,
    clampPercent,
    formatBinaryBytes,
    formatTemperature as formatMetricTemperature,
    getTemperatureColor,
    parseProcDiskstats,
    parseProcNetDev,
    parseDmiMemory,
    shouldHidePanel,
    timerIsActive,
} from './lib/logic.js';

const AVATAR_SIZE = 24;
const INHIBIT_IDLE_FLAG = 8;
const KEEP_AWAKE_REFRESH_SECONDS = 5;
const LOAD_KEYS = [
    'show-load-cpu',
    'show-load-mem',
    'show-load-swap',
    'show-load-igpu',
    'show-load-dgpu',
    'show-load-network',
    'show-load-disk',
];
const TEMP_KEYS = [
    'show-temp-cpu',
    'show-temp-igpu',
    'show-temp-dgpu',
];
const LOAD_COLORS = {
    cpu: '#62a0ea',
    mem: '#57e389',
    swap: '#f8e45c',
    igpu: '#c061cb',
    dgpu: '#ff7800',
    network: '#33d17a',
    disk: '#dc8add',
};
const DEFAULT_METRIC_COLOR = '#ffffff';
const METRIC_ICON_FALLBACKS = {
    cpu: 'power-profile-performance-symbolic',
    memory: 'drive-removable-media-symbolic',
    swap: 'media-flash-symbolic',
    gpu: 'video-display-symbolic',
    cpuTemp: 'temperature-symbolic',
    gpuTemp: 'temperature-symbolic',
    network: 'network-wired-symbolic',
    disk: 'drive-harddisk-symbolic',
};
const NVIDIA_METRICS_CACHE_MS = 5000;
const NVIDIA_FAILURE_CACHE_MS = 60000;
const TEXT_FILE_CACHE_USEC = 250000;
let nvidiaMetricsCache = {timestamp: 0, ttl: 0, value: null, pending: false};
let memoryHardwareCache = {timestamp: 0, value: null, pending: false};
const gpuNameCache = new Map();
const textFileCache = new Map();
const directoryCache = new Map();
let systemOnBattery = false;

function readTextFile(path) {
    const now = GLib.get_monotonic_time();
    const cached = textFileCache.get(path);

    if (!cached || now - cached.timestamp > TEXT_FILE_CACHE_USEC) {
        const state = cached ?? {value: null, pending: false, timestamp: 0};
        textFileCache.set(path, state);

        if (!state.pending) {
            state.pending = true;
            Gio.File.new_for_path(path).load_contents_async(null, (file, result) => {
                try {
                    const [ok, contents] = file.load_contents_finish(result);
                    state.value = ok ? new TextDecoder().decode(contents).trim() : null;
                } catch (_error) {
                    state.value = null;
                } finally {
                    state.timestamp = GLib.get_monotonic_time();
                    state.pending = false;
                }
            });
        }
    }

    return textFileCache.get(path)?.value ?? null;
}

function readNumberFile(path) {
    const value = readTextFile(path);
    return value === null ? null : Number.parseInt(value, 10);
}

function listDirectory(path) {
    const now = GLib.get_monotonic_time();
    const state = directoryCache.get(path) ?? {
        value: [],
        timestamp: 0,
        pending: false,
    };
    directoryCache.set(path, state);
    if (!state.pending && now - state.timestamp > 5_000_000) {
        state.pending = true;
        const file = Gio.File.new_for_path(path);
        file.enumerate_children_async(
            'standard::name',
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT,
            null,
            (source, result) => {
                let enumerator;
                try {
                    enumerator = source.enumerate_children_finish(result);
                } catch (_error) {
                    state.value = [];
                    state.timestamp = GLib.get_monotonic_time();
                    state.pending = false;
                    return;
                }

                const names = [];
                const readNextBatch = () => {
                    enumerator.next_files_async(64, GLib.PRIORITY_DEFAULT, null, (current, nextResult) => {
                        try {
                            const infos = current.next_files_finish(nextResult);
                            if (infos.length > 0) {
                                names.push(...infos.map(info => info.get_name()));
                                readNextBatch();
                                return;
                            }
                            state.value = names;
                        } catch (_error) {
                            state.value = [];
                        }
                        state.timestamp = GLib.get_monotonic_time();
                        state.pending = false;
                        enumerator.close_async(GLib.PRIORITY_DEFAULT, null, null);
                    });
                };
                readNextBatch();
            }
        );
    }
    return state.value;
}

function formatPercent(value) {
    return value === null || Number.isNaN(value) ? '--' : `${Math.round(value)}%`;
}

function getRoundedPercent(value) {
    return clampPercent(value);
}

function formatTemperature(temp, unit, decimals) {
    return formatMetricTemperature(temp, unit, decimals);
}

async function isMediaPlaying(cancellable = null) {
    try {
        const namesResult = await dbusCallAsync(
            Gio.DBus.session,
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            'org.freedesktop.DBus',
            'ListNames',
            null,
            new GLib.VariantType('(as)'),
            1000,
            cancellable
        );
        const [names] = namesResult.recursiveUnpack();

        for (const name of names.filter(value => value.startsWith('org.mpris.MediaPlayer2.'))) {
            try {
                const statusResult = await dbusCallAsync(
                    Gio.DBus.session,
                    name,
                    '/org/mpris/MediaPlayer2',
                    'org.freedesktop.DBus.Properties',
                    'Get',
                    new GLib.Variant('(ss)', ['org.mpris.MediaPlayer2.Player', 'PlaybackStatus']),
                    new GLib.VariantType('(v)'),
                    500,
                    cancellable
                );
                const [status] = statusResult.recursiveUnpack();

                if (status === 'Playing')
                    return true;
            } catch (_error) {
                // Players can disappear between listing and querying them.
            }
        }
    } catch (_error) {
        return false;
    }

    return false;
}

function formatGiB(kib) {
    return formatBinaryBytes(kib * 1024);
}

function formatBytes(bytes) {
    return formatBinaryBytes(bytes);
}

function formatMemoryHardwareModules(modules) {
    const types = [...new Set(modules.map(module => module.type).filter(Boolean))];
    const speeds = [...new Set(modules.map(module => module.speed).filter(Boolean))];
    const moduleLines = modules.map(module => [
        module.locator,
        module.size,
        module.speed,
        module.part,
    ].filter(Boolean).join(' · '));
    return [
        `${modules.length} populated ${modules.length === 1 ? 'DIMM' : 'DIMMs'}${types.length ? ` · ${types.join('/')}` : ''}`,
        speeds.length ? `Speed: ${speeds.join('/')}` : '',
        ...moduleLines.slice(0, 4),
    ].filter(Boolean).join('\n');
}

function getMemoryHardwareInfo(cancellable = null) {
    const modules = [];

    for (const controller of listDirectory('/sys/devices/system/edac/mc').filter(name => /^mc\d+$/.test(name))) {
        const controllerPath = `/sys/devices/system/edac/mc/${controller}`;

        for (const dimm of listDirectory(controllerPath).filter(name => /^dimm\d+$/.test(name))) {
            const dimmPath = `${controllerPath}/${dimm}`;
            const size = readNumberFile(`${dimmPath}/size`);

            if (size > 0) {
                modules.push({
                    type: readTextFile(`${dimmPath}/dimm_mem_type`) ?? '',
                    size: `${Math.round(size / 1024)}GB`,
                });
            }
        }
    }

    if (modules.length > 0) {
        memoryHardwareCache.value = formatMemoryHardwareModules(modules);
        memoryHardwareCache.timestamp = GLib.get_monotonic_time() / 1000;
        return memoryHardwareCache.value;
    }

    const now = GLib.get_monotonic_time() / 1000;
    if (!memoryHardwareCache.pending &&
        (!memoryHardwareCache.timestamp || now - memoryHardwareCache.timestamp >= 60000)) {
        memoryHardwareCache.pending = true;
        runCommandAsync(['dmidecode', '--type', '17'], {timeoutMs: 3000, cancellable})
            .then(dmi => {
                const dmiModules = parseDmiMemory(dmi);
                memoryHardwareCache.value = dmiModules.length > 0
                    ? formatMemoryHardwareModules(dmiModules)
                    : 'RAM hardware inventory unavailable to this user';
            })
            .finally(() => {
                memoryHardwareCache.timestamp = GLib.get_monotonic_time() / 1000;
                memoryHardwareCache.pending = false;
            });
    }

    return memoryHardwareCache.value ?? 'RAM hardware inventory loading…';
}

function parseMeminfo() {
    const contents = readTextFile('/proc/meminfo');
    const values = {};

    if (!contents)
        return values;

    for (const line of contents.split('\n')) {
        const match = line.match(/^([^:]+):\s+(\d+)/);

        if (match)
            values[match[1]] = Number.parseInt(match[2], 10);
    }

    return values;
}

function parseCpuStat() {
    const line = readTextFile('/proc/stat')?.split('\n')[0];

    if (!line?.startsWith('cpu '))
        return null;

    const values = line.trim().split(/\s+/).slice(1).map(value => Number.parseInt(value, 10));
    const idle = (values[3] ?? 0) + (values[4] ?? 0);
    const total = values.reduce((sum, value) => sum + value, 0);

    return {idle, total};
}

function getCpuModel() {
    const contents = readTextFile('/proc/cpuinfo');
    const match = contents?.match(/^model name\s+:\s+(.+)$/m);

    return match?.[1] ?? 'CPU model loading...';
}

function getGpuDisplayName(device) {
    if (!device)
        return null;

    if (gpuNameCache.has(device.path))
        return gpuNameCache.get(device.path);

    gpuNameCache.set(device.path, device.name);
    runCommandAsync(['udevadm', 'info', '--query=property', `--path=${device.path}`], {timeoutMs: 2000})
        .then(properties => {
            const model = properties.match(/^ID_MODEL_FROM_DATABASE=(.+)$/m)?.[1] ??
                properties.match(/^ID_MODEL=(.+)$/m)?.[1] ?? device.name;
            gpuNameCache.set(device.path, model);
        });
    return device.name;
}

function getGpuDevices() {
    const devices = [];

    for (const card of listDirectory('/sys/class/drm').filter(name => /^card\d+$/.test(name))) {
        const devicePath = `/sys/class/drm/${card}/device`;
        const vendor = readTextFile(`${devicePath}/vendor`);

        if (!vendor)
            continue;

        const vendorId = vendor.toLowerCase();
        const bootVga = readTextFile(`${devicePath}/boot_vga`) === '1';

        devices.push({
            card,
            path: devicePath,
            vendor: vendorId,
            bootVga,
            type: vendorId === '0x8086' ? 'igpu' : 'dgpu',
            name: readTextFile(`${devicePath}/device`) ?? card,
        });
    }

    for (const device of devices) {
        if (device.vendor === '0x1002' && device.bootVga)
            device.type = 'igpu';
    }

    return devices;
}

function getGpuByType(type, selected = 'auto') {
    const devices = getGpuDevices();
    if (selected !== 'auto')
        return devices.find(device => device.card === selected) ?? null;

    return devices.find(device => device.type === type) ?? null;
}

function getGpuEngineStat(device) {
    const engineRoots = [
        `/sys/class/drm/${device.card}/engine`,
        `${device.path}/engine`,
    ];
    const engines = {};
    let found = false;

    for (const root of engineRoots) {
        for (const engine of listDirectory(root)) {
            const value = readNumberFile(`${root}/${engine}/busy`);

            if (value !== null) {
                engines[engine] = value;
                found = true;
            }
        }

        if (found)
            return {engines, time: GLib.get_monotonic_time()};
    }

    return null;
}

function getGpuMetrics(type, previousStat = null, selected = 'auto', nvidiaIndex = 0) {
    const selectedDevice = getGpuByType(type, selected);
    if (type === 'dgpu' && (selected === 'auto' || selectedDevice?.vendor === '0x10de')) {
        const nvidia = getNvidiaMetrics(nvidiaIndex);

        if (nvidia) {
            return {
                type: 'load',
                id: 'dgpu',
                name: 'dGPU',
                percent: getRoundedPercent(nvidia.usage),
                color: LOAD_COLORS.dgpu,
                tooltip: `dGPU ${formatPercent(nvidia.usage)}\n${nvidia.usedMiB}/${nvidia.totalMiB}MB · ${nvidia.name}`,
            };
        }
    }

    const device = selectedDevice;

    if (!device)
        return null;

    const busy = readNumberFile(`${device.path}/gpu_busy_percent`);
    const used = readNumberFile(`${device.path}/mem_info_vram_used`);
    const total = readNumberFile(`${device.path}/mem_info_vram_total`);
    const engineStat = busy === null ? getGpuEngineStat(device) : null;
    const engineUsage = engineStat && previousStat
        ? Math.max(...Object.entries(engineStat.engines).map(([engine, busy]) =>
            calculateEngineUsage(
                {busy: previousStat.engines?.[engine] ?? busy, time: previousStat.time},
                {busy, time: engineStat.time}
            ) ?? 0
        ), 0)
        : null;
    const usage = busy ?? engineUsage;
    const memoryUsage = used !== null && total ? used / total * 100 : null;

    return {
        type: 'load',
        id: type,
        name: type === 'igpu' ? 'iGPU' : 'dGPU',
        percent: getRoundedPercent(usage),
        color: LOAD_COLORS[type],
        engineStat,
        tooltip: [
            `${type === 'igpu' ? 'iGPU' : 'dGPU'} ${formatPercent(usage)}`,
            total ? `VRAM ${formatBytes(used)}/${formatBytes(total)} (${formatPercent(memoryUsage)})` : getGpuDisplayName(device),
            total ? getGpuDisplayName(device) : '',
        ].filter(Boolean).join('\n'),
    };
}

function getNvidiaMetrics(index = 0) {
    const now = GLib.get_monotonic_time() / 1000;

    if (now - nvidiaMetricsCache.timestamp < nvidiaMetricsCache.ttl)
        return nvidiaMetricsCache.values?.[index] ?? nvidiaMetricsCache.value;

    // Never let polling initialize or probe a dormant NVIDIA driver. Calling
    // nvidia-smi too early can repeatedly trigger a failing modprobe on
    // unsupported or misconfigured hybrid-GPU systems.
    const driverBaseReady =
        GLib.file_test('/sys/module/nvidia', GLib.FileTest.IS_DIR) &&
        GLib.file_test('/dev/nvidiactl', GLib.FileTest.EXISTS) &&
        GLib.file_test('/proc/driver/nvidia/gpus', GLib.FileTest.IS_DIR);
    const driverReady = driverBaseReady &&
        listDirectory('/proc/driver/nvidia/gpus').length > 0;

    if (!driverReady) {
        nvidiaMetricsCache = {
            timestamp: now,
            ttl: driverBaseReady ? NVIDIA_METRICS_CACHE_MS : NVIDIA_FAILURE_CACHE_MS,
            value: null,
            pending: false,
        };
        return null;
    }

    if (!nvidiaMetricsCache.pending) {
        nvidiaMetricsCache.pending = true;
        runCommandAsync([
            'nvidia-smi',
            '--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,name',
            '--format=csv,noheader,nounits',
        ], {timeoutMs: 3000}).then(stdout => {
            const gpus = stdout.split('\n').map(line => {
                const fields = line.split(',').map(field => field.trim());
                if (fields.length < 5)
                    return null;
                return {
                    usage: Number.parseInt(fields[0], 10),
                    usedMiB: Number.parseInt(fields[1], 10),
                    totalMiB: Number.parseInt(fields[2], 10),
                    temp: Number.parseInt(fields[3], 10),
                    name: fields.slice(4).join(', '),
                };
            }).filter(Boolean);
            nvidiaMetricsCache = {
                timestamp: GLib.get_monotonic_time() / 1000,
                ttl: gpus.length ? NVIDIA_METRICS_CACHE_MS : NVIDIA_FAILURE_CACHE_MS,
                value: gpus[0] ?? null,
                values: gpus,
                pending: false,
            };
        }).catch(() => {
            nvidiaMetricsCache = {
                timestamp: GLib.get_monotonic_time() / 1000,
                ttl: NVIDIA_FAILURE_CACHE_MS,
                value: null,
                pending: false,
            };
        });
    }
    return nvidiaMetricsCache.values?.[index] ?? nvidiaMetricsCache.value;
}

function getHwmonTemperature(devicePath) {
    for (const hwmon of listDirectory(`${devicePath}/hwmon`)) {
        const hwmonPath = `${devicePath}/hwmon/${hwmon}`;
        const names = listDirectory(hwmonPath);
        const labels = names.filter(name => /^temp\d+_label$/.test(name));
        const preferred = labels.find(label => {
            const value = readTextFile(`${hwmonPath}/${label}`)?.toLowerCase() ?? '';
            return value.includes('edge') || value.includes('gpu') || value.includes('package');
        }) ?? labels[0];
        const inputName = preferred?.replace('_label', '_input') ??
            names.find(name => /^temp\d+_input$/.test(name));
        const value = inputName ? readNumberFile(`${hwmonPath}/${inputName}`) : null;
        if (value !== null) {
            return {
                temp: value / 1000,
                sensor: preferred
                    ? readTextFile(`${hwmonPath}/${preferred}`) ?? preferred
                    : inputName,
            };
        }
    }

    return {temp: null, sensor: 'unavailable'};
}

function getGpuTemperature(type, selected = 'auto', nvidiaIndex = 0) {
    const selectedDevice = getGpuByType(type, selected);
    if (type === 'dgpu' && (selected === 'auto' || selectedDevice?.vendor === '0x10de')) {
        const nvidia = getNvidiaMetrics(nvidiaIndex);

        if (nvidia && !Number.isNaN(nvidia.temp))
            return {temp: nvidia.temp, sensor: `nvidia-smi GPU ${nvidiaIndex}`};
    }

    const device = selectedDevice;

    if (!device)
        return {temp: null, sensor: 'unavailable'};

    return getHwmonTemperature(device.path);
}

function getGpuDescription(type, selected = 'auto', nvidiaIndex = 0) {
    const selectedDevice = getGpuByType(type, selected);
    if (type === 'dgpu' && (selected === 'auto' || selectedDevice?.vendor === '0x10de')) {
        const nvidia = getNvidiaMetrics(nvidiaIndex);
        if (nvidia?.name)
            return nvidia.name;
    }

    return getGpuDisplayName(selectedDevice) ?? `${type === 'igpu' ? 'Integrated' : 'Dedicated'} GPU`;
}

function getCpuTemperature() {
    for (const hwmon of listDirectory('/sys/class/hwmon')) {
        const hwmonPath = `/sys/class/hwmon/${hwmon}`;
        const hwmonName = readTextFile(`${hwmonPath}/name`)?.toLowerCase() ?? '';
        const labels = listDirectory(hwmonPath).filter(name => /^temp\d+_label$/.test(name));
        const preferred = labels.find(label => {
            const text = readTextFile(`${hwmonPath}/${label}`)?.toLowerCase() ?? '';
            return text.includes('package') || text.includes('tctl') || text.includes('cpu');
        });
        const cpuHwmon = /^(coretemp|k10temp|zenpower|acpitz|cpu_thermal)$/.test(hwmonName);
        const inputName = preferred?.replace('_label', '_input') ?? (cpuHwmon
            ? listDirectory(hwmonPath).find(name => /^temp\d+_input$/.test(name))
            : null);
        const value = inputName ? readNumberFile(`${hwmonPath}/${inputName}`) : null;

        if (value !== null)
            return value / 1000;
    }

    for (const zone of listDirectory('/sys/class/thermal')) {
        const zonePath = `/sys/class/thermal/${zone}`;
        const type = readTextFile(`${zonePath}/type`)?.toLowerCase() ?? '';

        if (!type.includes('cpu') && !type.includes('x86_pkg_temp'))
            continue;

        const value = readNumberFile(`${zonePath}/temp`);

        if (value !== null)
            return value / 1000;
    }

    return null;
}

const SystemMetricsButton = GObject.registerClass(
class SystemMetricsButton extends PanelMenu.Button {
    _init(settings, side, extensionPath) {
        super._init(0.0, `Username Avatar ${side} Metrics`, false);

        this._destroyed = false;
        this.connect('destroy', () => {
            this._destroyed = true;
        });
        this._settings = settings;
        this._side = side;
        this._extensionPath = extensionPath;
        this._cpuModel = getCpuModel();
        this._previousCpuStat = parseCpuStat();
        this._previousGpuStats = new Map();
        this._previousNetworkStat = null;
        this._previousDiskStat = null;
        this._loadItems = [];
        this._tempItems = [];
        this._box = new St.BoxLayout({
            style_class: 'user-topmenu-metrics-box',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._box.spacing = 12;
        this._box.connect('destroy', () => {
            this._box = null;
            this._destroyed = true;
        });
        this.add_child(this._box);
        this.menu.actor.visible = false;
        this._tooltip = new St.BoxLayout({
            style_class: 'user-topmenu-metric-tooltip',
            vertical: true,
            visible: false,
            opacity: 255,
        });
        this._tooltip.spacing = 6;
        this._tooltip.connect('destroy', () => {
            this._tooltip = null;
        });
        Main.uiGroup.add_child(this._tooltip);

        this._settings.connectObject('changed', (_settings, key) => {
            if (key === 'network-interface')
                this._previousNetworkStat = null;

            if (LOAD_KEYS.includes(key) || key === 'loads-position') {
                this._refreshLoads();
                this._startLoadRefreshTimer();
            } else if (key === 'use-load-colors' || key === 'metric-order' ||
                key === 'igpu-device' || key === 'dgpu-device' || key === 'nvidia-index' ||
                key === 'network-interface') {
                this._refreshLoads();
            }

            if (TEMP_KEYS.includes(key) || key === 'temps-position') {
                this._refreshTemps();
                this._startTempRefreshTimer();
            } else if (key === 'temperature-unit' || key === 'temperature-decimals' ||
                key === 'use-temp-colors' || key === 'temp-warning' || key === 'temp-critical' ||
                key === 'igpu-device' || key === 'dgpu-device' || key === 'nvidia-index' ||
                key === 'temp-order') {
                this._refreshTemps();
            }

            if (key === 'loads-refresh-seconds')
                this._startLoadRefreshTimer();

            if (key === 'temps-refresh-seconds')
                this._startTempRefreshTimer();

            if (key === 'pause-metrics-when-locked' || key === 'adaptive-refresh-on-battery' ||
                key === 'battery-refresh-multiplier')
                this.refreshTimerConfiguration();
        }, this);
        this._startLoadRefreshTimer();
        this._startTempRefreshTimer();

        this._refreshLoads();
        this._refreshTemps();
    }

    _startLoadRefreshTimer() {
        if (this._loadTimeoutId) {
            GLib.Source.remove(this._loadTimeoutId);
            this._loadTimeoutId = null;
        }

        if (this._settings.get_string('loads-position') !== this._side ||
            !LOAD_KEYS.some(key => this._settings.get_boolean(key)))
            return;

        const seconds = this._getEffectiveInterval('loads-refresh-seconds');
        this._loadTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
            if (this._destroyed)
                return GLib.SOURCE_REMOVE;
            if (this._shouldPoll())
                this._refreshLoads();
            return GLib.SOURCE_CONTINUE;
        });
        GLib.Source.set_name_by_id(this._loadTimeoutId, `[${this.constructor.name}] loads refresh`);
    }

    _startTempRefreshTimer() {
        if (this._tempTimeoutId) {
            GLib.Source.remove(this._tempTimeoutId);
            this._tempTimeoutId = null;
        }

        if (this._settings.get_string('temps-position') !== this._side ||
            !TEMP_KEYS.some(key => this._settings.get_boolean(key)))
            return;

        const seconds = this._getEffectiveInterval('temps-refresh-seconds');
        this._tempTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
            if (this._destroyed)
                return GLib.SOURCE_REMOVE;
            if (this._shouldPoll())
                this._refreshTemps();
            return GLib.SOURCE_CONTINUE;
        });
        GLib.Source.set_name_by_id(this._tempTimeoutId, `[${this.constructor.name}] temps refresh`);
    }

    destroy() {
        this._destroyed = true;
        if (this._loadTimeoutId) {
            GLib.Source.remove(this._loadTimeoutId);
            this._loadTimeoutId = null;
        }

        if (this._tempTimeoutId) {
            GLib.Source.remove(this._tempTimeoutId);
            this._tempTimeoutId = null;
        }

        this._settings.disconnectObject(this);

        this._tooltip?.destroy();

        super.destroy();
    }

    refreshTimerConfiguration() {
        this._startLoadRefreshTimer();
        this._startTempRefreshTimer();
    }

    _getEffectiveInterval(key) {
        const base = this._settings.get_uint(key);
        return this._settings.get_boolean('adaptive-refresh-on-battery') && systemOnBattery
            ? base * this._settings.get_uint('battery-refresh-multiplier')
            : base;
    }

    _shouldPoll() {
        return !(this._settings.get_boolean('pause-metrics-when-locked') && Main.sessionMode.isLocked);
    }

    _refreshLoads() {
        if (this._destroyed)
            return;
        this._loadItems = this._settings.get_string('loads-position') === this._side
            ? this._getLoadItems()
            : [];
        this._render();
    }

    _refreshTemps() {
        if (this._destroyed)
            return;
        this._tempItems = this._settings.get_string('temps-position') === this._side
            ? this._getTempItems()
            : [];
        this._render();
    }

    _render() {
        if (this._destroyed || !this._box)
            return;
        this._hideTooltip();
        this._box.destroy_all_children();

        const firstGroup = this._side === 'left'
            ? this._getCachedItemsForGroup('loads')
            : this._getCachedItemsForGroup('temps');
        const secondGroup = this._side === 'left'
            ? this._getCachedItemsForGroup('temps')
            : this._getCachedItemsForGroup('loads');

        for (const item of firstGroup)
            this._box.add_child(this._createMetricLabel(item));

        if (firstGroup.length > 0 && secondGroup.length > 0)
            this._box.add_child(new St.Widget({width: 8}));

        for (const item of secondGroup)
            this._box.add_child(this._createMetricLabel(item));

        this.visible = firstGroup.length + secondGroup.length > 0;
    }

    _getCachedItemsForGroup(group) {
        return group === 'loads' ? this._loadItems : this._tempItems;
    }

    _getLoadItems() {
        const items = [];
        this._cpuModel = getCpuModel();

        if (this._settings.get_boolean('show-load-cpu'))
            items.push(this._getCpuLoadItem());

        if (this._settings.get_boolean('show-load-mem'))
            items.push(this._getMemoryItem());

        if (this._settings.get_boolean('show-load-swap'))
            items.push(this._getSwapItem());

        if (this._settings.get_boolean('show-load-igpu')) {
            const item = getGpuMetrics(
                'igpu',
                this._previousGpuStats.get('igpu'),
                this._settings.get_string('igpu-device'),
                this._settings.get_uint('nvidia-index')
            );
            if (item?.engineStat)
                this._previousGpuStats.set('igpu', item.engineStat);
            items.push(item ?? {
                type: 'load',
                id: 'igpu',
                name: 'iGPU',
                percent: null,
                color: LOAD_COLORS.igpu,
                tooltip: 'iGPU unavailable',
            });
        }

        if (this._settings.get_boolean('show-load-dgpu')) {
            const item = getGpuMetrics(
                'dgpu',
                this._previousGpuStats.get('dgpu'),
                this._settings.get_string('dgpu-device'),
                this._settings.get_uint('nvidia-index')
            );
            if (item?.engineStat)
                this._previousGpuStats.set('dgpu', item.engineStat);
            items.push(item ?? {
                type: 'load',
                id: 'dgpu',
                name: 'dGPU',
                percent: null,
                color: LOAD_COLORS.dgpu,
                tooltip: 'dGPU unavailable',
            });
        }

        if (this._settings.get_boolean('show-load-network'))
            items.push(this._getNetworkItem());

        if (this._settings.get_boolean('show-load-disk'))
            items.push(this._getDiskItem());

        const order = this._settings.get_string('metric-order').split(',').map(value => value.trim());
        return items.sort((a, b) => {
            const aIndex = order.indexOf(a.id);
            const bIndex = order.indexOf(b.id);
            return (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) -
                (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex);
        });
    }

    _getTempItems() {
        const items = [];
        this._cpuModel = getCpuModel();

        if (this._settings.get_boolean('show-temp-cpu')) {
            const temp = getCpuTemperature();
            const formatted = this._formatTemperature(temp);
            items.push({
                type: 'temp',
                id: 'cpu',
                name: 'CPU',
                temp,
                color: this._getTempColor(temp),
                tooltip: `CPU ${temp === null ? 'unavailable' : formatted}\n${this._cpuModel}`,
            });
        }

        if (this._settings.get_boolean('show-temp-igpu')) {
            const selected = this._settings.get_string('igpu-device');
            const info = getGpuTemperature('igpu', selected, this._settings.get_uint('nvidia-index'));
            const temp = info.temp;
            const formatted = this._formatTemperature(temp);
            items.push({
                type: 'temp',
                id: 'igpu',
                name: 'iGPU',
                temp,
                color: this._getTempColor(temp),
                tooltip: `iGPU ${temp === null ? 'unavailable' : formatted}\nSensor: ${info.sensor}\n${getGpuDescription('igpu', selected, this._settings.get_uint('nvidia-index'))}`,
            });
        }

        if (this._settings.get_boolean('show-temp-dgpu')) {
            const selected = this._settings.get_string('dgpu-device');
            const index = this._settings.get_uint('nvidia-index');
            const info = getGpuTemperature('dgpu', selected, index);
            const temp = info.temp;
            const formatted = this._formatTemperature(temp);
            items.push({
                type: 'temp',
                id: 'dgpu',
                name: 'dGPU',
                temp,
                color: this._getTempColor(temp),
                tooltip: `dGPU ${temp === null ? 'unavailable' : formatted}\nSensor: ${info.sensor}\n${getGpuDescription('dgpu', selected, index)}`,
            });
        }

        const order = this._settings.get_string('temp-order').split(',').map(value => value.trim());
        return items.sort((a, b) => {
            const aIndex = order.indexOf(a.id);
            const bIndex = order.indexOf(b.id);
            return (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) -
                (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex);
        });
    }

    _getCpuLoadItem() {
        const current = parseCpuStat();
        const percent = calculateCpuUsage(this._previousCpuStat, current);

        if (current)
            this._previousCpuStat = current;

        return {
            type: 'load',
            id: 'cpu',
            name: 'CPU',
            percent: getRoundedPercent(percent),
            color: LOAD_COLORS.cpu,
            tooltip: [`CPU ${formatPercent(percent)}`, this._cpuModel],
        };
    }

    _getMemoryItem() {
        const meminfo = parseMeminfo();
        const total = meminfo.MemTotal ?? 0;
        const available = meminfo.MemAvailable ?? 0;
        const {used, percent} = calculateMemoryUsage(total, available);

        return {
            type: 'load',
            id: 'mem',
            name: 'MEM',
            percent: getRoundedPercent(percent),
            color: LOAD_COLORS.mem,
            tooltip: [`MEM ${formatPercent(percent)}`, `${formatGiB(used)}/${formatGiB(total)}`, getMemoryHardwareInfo()],
        };
    }

    _getSwapItem() {
        const meminfo = parseMeminfo();
        const total = meminfo.SwapTotal ?? 0;
        const free = meminfo.SwapFree ?? 0;
        const {used, percent} = calculateMemoryUsage(total, free);

        return {
            type: 'load',
            id: 'swap',
            name: 'SWAP',
            percent: getRoundedPercent(percent),
            color: LOAD_COLORS.swap,
            tooltip: [`SWAP ${formatPercent(percent)}`, `${formatGiB(used)}/${formatGiB(total)}`],
        };
    }

    _getNetworkItem() {
        const selected = this._settings.get_string('network-interface');
        const interfaces = listDirectory('/sys/class/net');
        const ignored = selected === 'auto'
            ? interfaces.filter(name => name === 'lo' ||
                !GLib.file_test(`/sys/class/net/${name}/device`, GLib.FileTest.EXISTS))
            : interfaces.filter(name => name !== selected);
        const counters = parseProcNetDev(readTextFile('/proc/net/dev'), ignored);
        const now = GLib.get_monotonic_time();
        let rxRate = 0;
        let txRate = 0;
        if (this._previousNetworkStat) {
            const seconds = (now - this._previousNetworkStat.time) / 1_000_000;
            if (seconds > 0) {
                rxRate = Math.max(0, counters.rx - this._previousNetworkStat.rx) / seconds;
                txRate = Math.max(0, counters.tx - this._previousNetworkStat.tx) / seconds;
            }
        }
        this._previousNetworkStat = {...counters, time: now};
        return {
            type: 'rate',
            id: 'network',
            name: 'NET',
            value: `↓${formatBinaryBytes(rxRate, 1)}/s`,
            color: LOAD_COLORS.network,
            tooltip: `Network throughput (${selected === 'auto' ? 'physical interfaces' : selected})\nDownload ${formatBinaryBytes(rxRate, 1)}/s\nUpload ${formatBinaryBytes(txRate, 1)}/s`,
        };
    }

    _getDiskItem() {
        const counters = parseProcDiskstats(readTextFile('/proc/diskstats'));
        const now = GLib.get_monotonic_time();
        let readRate = 0;
        let writeRate = 0;
        if (this._previousDiskStat) {
            const seconds = (now - this._previousDiskStat.time) / 1_000_000;
            if (seconds > 0) {
                readRate = Math.max(0, counters.readBytes - this._previousDiskStat.readBytes) / seconds;
                writeRate = Math.max(0, counters.writeBytes - this._previousDiskStat.writeBytes) / seconds;
            }
        }
        this._previousDiskStat = {...counters, time: now};
        return {
            type: 'rate',
            id: 'disk',
            name: 'DISK',
            value: `R ${formatBinaryBytes(readRate, 1)}/s`,
            color: LOAD_COLORS.disk,
            tooltip: `Disk activity\nRead ${formatBinaryBytes(readRate, 1)}/s\nWrite ${formatBinaryBytes(writeRate, 1)}/s`,
        };
    }

    _createMetricLabel(item) {
        const actor = item.type === 'temp'
            ? this._createTempMetric(item)
            : item.type === 'rate'
                ? this._createRateMetric(item)
                : this._createLoadMetric(item);

        actor.connectObject(
            'enter-event', () => {
                this._showTooltip(actor, item);
            },
            'leave-event', () => {
                this._hideTooltip();
            },
            'key-focus-in', () => {
                this._showTooltip(actor, item);
            },
            'key-focus-out', () => {
                this._hideTooltip();
            },
            'button-press-event', () => {
                this._activateMetricAction();
                return Clutter.EVENT_STOP;
            },
            'key-press-event', (_actor, event) => {
                const symbol = event.get_key_symbol();
                if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_space) {
                    this._activateMetricAction();
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            },
            this
        );
        return actor;
    }

    _createLoadMetric(item) {
        const metric = new St.BoxLayout({
            style_class: 'user-topmenu-load-metric',
            reactive: true,
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        metric.spacing = 5;

        const iconBox = new St.BoxLayout({
            y_align: Clutter.ActorAlign.CENTER,
        });
        iconBox.spacing = 2;
        const icon = new St.Icon({
            gicon: this._getMetricIcon(this._getLoadIconName(item.name)),
            style: `color: ${this._getMetricColor(item)};`,
            icon_size: 15,
            y_align: Clutter.ActorAlign.CENTER,
        });
        iconBox.add_child(icon);

        const qualifier = this._getLoadIconQualifier(item.name);
        if (qualifier) {
            iconBox.add_child(new St.Label({
                text: qualifier,
                style_class: 'user-topmenu-load-qualifier',
                style: `color: ${this._getMetricColor(item)};`,
                y_align: Clutter.ActorAlign.CENTER,
            }));
        }

        const column = new St.BoxLayout({
            style_class: 'user-topmenu-load-column',
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        column.set_size(9, 18);

        const fillHeight = item.percent === null
            ? 2
            : Math.max(1, Math.round(item.percent / 100 * 18));
        const spacer = new St.Widget();
        spacer.set_size(9, 18 - fillHeight);
        const fill = new St.Widget({
            style_class: 'user-topmenu-load-fill',
            style: `background-color: ${this._getMetricColor(item)};`,
        });
        fill.set_size(9, fillHeight);
        column.add_child(spacer);
        column.add_child(fill);

        metric.add_child(iconBox);
        metric.add_child(column);
        metric.accessible_name = `${item.name} ${formatPercent(item.percent)}`;
        return metric;
    }

    _getLoadIconName(name) {
        switch (name) {
        case 'CPU':
            return 'cpu';
        case 'MEM':
            return 'memory';
        case 'SWAP':
            return 'swap';
        case 'iGPU':
            return 'gpu';
        case 'dGPU':
            return 'gpu';
        default:
            return 'cpu';
        }
    }

    _getLoadIconQualifier(name) {
        if (name === 'iGPU')
            return 'i';

        if (name === 'dGPU')
            return 'd';

        return '';
    }

    _createTempMetric(item) {
        const box = new St.BoxLayout({
            style_class: 'user-topmenu-temp-column',
            reactive: true,
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.spacing = 5;

        const icon = new St.Icon({
            gicon: this._getMetricIcon(item.name === 'CPU' ? 'cpuTemp' : 'gpuTemp'),
            style: `color: ${this._getMetricColor(item)};`,
            icon_size: 13,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const label = new St.Label({
            text: this._formatTemperature(item.temp),
            style_class: 'user-topmenu-temp-label',
            style: `color: ${this._getMetricColor(item)};`,
            y_align: Clutter.ActorAlign.CENTER,
        });

        box.add_child(icon);
        box.add_child(label);
        box.accessible_name = `${item.name} ${item.temp === null ? 'temperature unavailable' : this._formatTemperature(item.temp)}`;
        return box;
    }

    _createRateMetric(item) {
        const box = new St.BoxLayout({
            style_class: 'user-topmenu-rate-metric',
            reactive: true,
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.spacing = 4;
        box.add_child(new St.Icon({
            gicon: this._getMetricIcon(item.id),
            style: `color: ${this._getMetricColor(item)};`,
            icon_size: 13,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        box.add_child(new St.Label({
            text: item.value,
            style: `color: ${this._getMetricColor(item)};`,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        box.accessible_name = `${item.name} ${item.value}`;
        return box;
    }

    _formatTemperature(temp) {
        return formatTemperature(
            temp,
            this._settings.get_string('temperature-unit'),
            this._settings.get_boolean('temperature-decimals')
        );
    }

    _getTempColor(temp) {
        return getTemperatureColor(
            temp,
            this._settings.get_uint('temp-warning'),
            this._settings.get_uint('temp-critical')
        );
    }

    _getMetricColor(item) {
        if ((item.type === 'load' || item.type === 'rate') &&
            !this._settings.get_boolean('use-load-colors'))
            return DEFAULT_METRIC_COLOR;

        if (item.type === 'temp' && !this._settings.get_boolean('use-temp-colors'))
            return DEFAULT_METRIC_COLOR;

        return item.color;
    }

    _getMetricIcon(name) {
        if (name === 'cpu' || name === 'memory')
            return Gio.icon_new_for_string(METRIC_ICON_FALLBACKS[name]);

        const path = `${this._extensionPath}/metric-${name}-symbolic.svg`;

        if (GLib.file_test(path, GLib.FileTest.EXISTS))
            return Gio.icon_new_for_string(path);

        return Gio.icon_new_for_string(METRIC_ICON_FALLBACKS[name.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] ??
            'dialog-information-symbolic');
    }

    _showTooltip(actor, item) {
        if (!this._tooltip)
            return;

        this._tooltip.destroy_all_children();
        this._tooltip.add_child(new St.Label({
            text: Array.isArray(item.tooltip) ? item.tooltip[0] : String(item.tooltip).split('\n')[0],
            style_class: 'user-topmenu-metric-tooltip-title',
        }));

        if (item.type === 'load') {
            const barWidth = 120;
            const bar = new St.BoxLayout({
                style_class: 'user-topmenu-tooltip-bar',
            });
            bar.set_width(barWidth);
            const fill = new St.Widget({
                style_class: 'user-topmenu-tooltip-bar-fill',
                style: `background-color: ${this._getMetricColor(item)};`,
            });
            const empty = new St.Widget({
                style_class: 'user-topmenu-tooltip-bar-empty',
            });
            const percent = item.percent === null ? 0 : Math.max(0, Math.min(100, item.percent));
            fill.set_size(Math.max(1, Math.round(percent / 100 * barWidth)), 6);
            empty.set_size(Math.max(1, barWidth - Math.round(percent / 100 * barWidth)), 6);
            bar.add_child(fill);
            bar.add_child(empty);
            this._tooltip.add_child(bar);
        }

        const lines = Array.isArray(item.tooltip)
            ? item.tooltip.slice(1)
            : String(item.tooltip).split('\n').slice(1);

        for (const line of lines.filter(Boolean)) {
            this._tooltip.add_child(new St.Label({
                text: line,
                style_class: 'user-topmenu-metric-tooltip-detail',
            }));
        }

        this._tooltip.visible = true;
        this._tooltip.get_parent()?.set_child_above_sibling(this._tooltip, null);

        const [actorX, actorY] = actor.get_transformed_position();
        const [actorWidth, actorHeight] = actor.get_transformed_size();
        const [, tooltipWidth] = this._tooltip.get_preferred_width(-1);
        const monitor = Main.layoutManager.primaryMonitor;
        const x = Math.min(
            Math.max(actorX + actorWidth / 2 - tooltipWidth / 2, monitor.x + 8),
            monitor.x + monitor.width - tooltipWidth - 8
        );
        const y = actorY + actorHeight + 8;

        this._tooltip.set_position(Math.round(x), Math.round(y));
    }

    _hideTooltip() {
        if (this._tooltip)
            this._tooltip.visible = false;
    }

    _activateMetricAction() {
        if (this._settings.get_string('metrics-click-action') !== 'system-monitor')
            return;

        const appSystem = Shell.AppSystem.get_default();
        const app = appSystem.lookup_app('org.gnome.SystemMonitor.desktop') ??
            appSystem.lookup_app('gnome-system-monitor.desktop');
        app?.activate();
    }
});

const UserQuickToggle = GObject.registerClass(
class UserQuickToggle extends QuickSettings.QuickMenuToggle {
    _init(extension) {
        super._init({
            title: extension._getDisplayName(),
            iconName: 'avatar-default-symbolic',
        });

        this._extension = extension;
        this._settings = extension._settings;
        this._desktopInterfaceSettings = new Gio.Settings({schema: 'org.gnome.desktop.interface'});
        this._touchpadSettings = new Gio.Settings({schema: 'org.gnome.desktop.peripherals.touchpad'});
        this._switchItems = [];

        this.menu.setHeader('avatar-default-symbolic', extension._getDisplayName(), null);

        this._keepAwakeControls = addKeepAwakeControls(this.menu, this._settings, this);
        this._keepAwakeItem = this._keepAwakeControls.manual;

        Object.assign(this, addSharedMenuSections(this, this.menu, false));

        this._desktopInterfaceSettings.connectObject('changed::gtk-enable-primary-paste', () => {
            syncSharedMenuSections(this);
        }, this);
        this._touchpadSettings.connectObject('changed::tap-button-map', () => {
            syncSharedMenuSections(this);
        }, this);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction(translate('Open Preferences'), () => {
            this._extension.openPreferences().catch(error => {
                console.error(`Failed to open preferences: ${error.message}`);
            });
        });
        this.menu.addAction(translate('Lock Screen'), () => {
            SystemActions.getDefault().activateLockScreen();
        });
        this.menu.addAction(translate('Log Out'), () => {
            SystemActions.getDefault().activateLogout();
        });

        this.connectObject('clicked', () => {
            if (this._syncingChecked)
                return;

            const nextState = !this._settings.get_boolean('show-topbar');
            this._settings.set_boolean('show-topbar', nextState);
        }, this);

        this.sync();
    }

    sync() {
        const keepAwake = this._settings.get_boolean('keep-awake');
        const showTopBar = this._settings.get_boolean('show-topbar');
        const displayName = this._extension._getDisplayName();

        this.title = displayName;
        this._syncingChecked = true;
        this.checked = showTopBar;
        this._syncingChecked = false;
        this.menu.setHeader(
            'avatar-default-symbolic',
            displayName,
            showTopBar ? 'Shown in top bar' : 'Hidden from top bar'
        );

        if (this._keepAwakeItem.state !== keepAwake)
            this._keepAwakeItem.setToggleState(keepAwake);
        syncKeepAwakeControls(this._keepAwakeControls, this._settings);

        syncSharedMenuSections(this);
    }

    destroy() {
        this._desktopInterfaceSettings.disconnectObject(this);
        this._touchpadSettings.disconnectObject(this);
        this.disconnectObject(this);
        this._disconnectSwitchItems();

        super.destroy();
    }

    _disconnectSwitchItems() {
        for (const item of this._switchItems)
            item.disconnectObject(this);

        this._switchItems = [];
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

    destroy() {
        this.quickSettingsItems.forEach(item => item.destroy());
        this.quickSettingsItems = [];
        this._toggle = null;
        super.destroy();
    }
});

const UserTopMenuButton = GObject.registerClass(
class UserTopMenuButton extends PanelMenu.Button {
    _init(settings) {
        super._init(0.0, 'Username Avatar Top Menu', false);

        this._settings = settings;
        this._desktopInterfaceSettings = new Gio.Settings({schema: 'org.gnome.desktop.interface'});
        this._touchpadSettings = new Gio.Settings({schema: 'org.gnome.desktop.peripherals.touchpad'});
        this._switchItems = [];
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
        this._stateIconsBox = new St.BoxLayout({
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        this._stateIconsBox.spacing = 6;

        this._fullscreenIcon = new St.Icon({
            icon_name: 'view-fullscreen-symbolic',
            style_class: 'user-topmenu-autohide-icon',
            icon_size: 12,
            visible: false,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._stateIcon = new St.Icon({
            icon_name: 'weather-clear-symbolic',
            style_class: 'user-topmenu-state-icon',
            icon_size: 12,
            visible: false,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._stateIconsBox.add_child(this._fullscreenIcon);
        this._stateIconsBox.add_child(this._stateIcon);

        this._box.add_child(this._avatarFrame);
        this._box.add_child(this._avatarLabelSpacer);
        this._box.add_child(this._label);
        this._box.add_child(this._labelHostnameSpacer);
        this._box.add_child(this._hostnameIcon);
        this._box.add_child(this._hostnameTextSpacer);
        this._box.add_child(this._hostnameLabel);
        this._box.add_child(this._hostnameStateSpacer);
        this._box.add_child(this._stateIconsBox);
        this.add_child(this._box);

        this._nameItem = new PopupMenu.PopupMenuItem(this._buildLabel(), {
            reactive: false,
            can_focus: false,
        });
        this.menu.addMenuItem(this._nameItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._keepAwakeControls = addKeepAwakeControls(this.menu, this._settings, this);
        this._keepAwakeItem = this._keepAwakeControls.manual;

        Object.assign(this, addSharedMenuSections(this, this.menu, true));

        this._desktopInterfaceSettings.connectObject('changed::gtk-enable-primary-paste', () => {
            syncSharedMenuSections(this);
        }, this);
        this._touchpadSettings.connectObject('changed::tap-button-map', () => {
            syncSharedMenuSections(this);
        }, this);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction(translate('Lock Screen'), () => {
            SystemActions.getDefault().activateLockScreen();
        });

        this._settings.connectObject('changed', (_settings, key) => {
            if (key === 'show-hostname' || key === 'show-username' || key === 'show-avatar')
                this._refreshLabel();

            if (key === 'keep-awake' || key === 'keep-awake-fullscreen' ||
                key === 'keep-awake-media' || key === 'keep-awake-timer-active' ||
                key === 'keep-awake-timer-deadline')
                this._syncKeepAwakeState();

            if (key === 'show-topbar')
                this._syncTopBarState();

            if (key === 'show-quick-settings')
                this._syncShowQuickSettingsState();

            if (key === 'hide-topbar-fullscreen' || key === 'hide-topbar-fullscreen-all-monitors' ||
                key === 'hide-topbar-maximized' || key === 'hide-topbar-touching')
                this._syncAutohideState();
        }, this);

        this._refreshLabel();
        this._syncKeepAwakeState();
        this._syncTopBarState();
        this._syncShowQuickSettingsState();
        this._syncAutohideState();
        syncSharedMenuSections(this);
    }

    _createAvatarActor(userName) {
        const avatarPath = `/var/lib/AccountsService/icons/${userName}`;
        const icon = GLib.file_test(avatarPath, GLib.FileTest.EXISTS)
            ? new St.Icon({
                gicon: new Gio.FileIcon({file: Gio.File.new_for_path(avatarPath)}),
                icon_size: AVATAR_SIZE,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            })
            : new St.Icon({
                gicon: new Gio.ThemedIcon({name: 'avatar-default-symbolic'}),
                icon_size: AVATAR_SIZE,
                y_align: Clutter.ActorAlign.CENTER,
            });

        return new St.Bin({
            style_class: 'user-topmenu-avatar',
            clip_to_allocation: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            child: icon,
        });
    }

    _getDisplayName() {
        return this._realName && this._realName !== 'Unknown' ? this._realName : this._userName;
    }

    _buildLabel() {
        let label = '';

        if (this._settings.get_boolean('show-username'))
            label = this._getDisplayName();

        if (this._settings.get_boolean('show-hostname')) {
            if (label)
                label += ` on ${this._hostname}`;
            else
                label = this._hostname;
        }

        if (!label)
            label = this._getDisplayName();

        return label;
    }

    _refreshLabel() {
        const displayName = this._getDisplayName();
        const showHostname = this._settings.get_boolean('show-hostname');
        const showUsername = this._settings.get_boolean('show-username');
        const showAvatar = this._settings.get_boolean('show-avatar');
        const hasLeadingText = showUsername;
        const hasHostnameText = showHostname;

        const showFallbackAvatar = !showAvatar && !showUsername && !showHostname;
        this._avatarFrame.visible = showAvatar || showFallbackAvatar;
        this._avatarLabelSpacer.visible = showAvatar && (showUsername || showHostname);
        this._label.visible = showUsername;
        this._label.set_text(displayName);
        this._labelHostnameSpacer.visible = hasLeadingText && hasHostnameText;
        this._hostnameIcon.visible = showHostname;
        this._hostnameTextSpacer.visible = showHostname;
        this._hostnameLabel.visible = showHostname;
        this._hostnameLabel.set_text(showHostname ? this._hostname : '');
        this._nameItem.label.set_text(this._buildLabel());

        if (this._showHostnameItem.state !== showHostname)
            this._showHostnameItem.setToggleState(showHostname);

        if (this._showUsernameItem.state !== showUsername)
            this._showUsernameItem.setToggleState(showUsername);

        if (this._showAvatarItem.state !== showAvatar)
            this._showAvatarItem.setToggleState(showAvatar);
    }

    _syncKeepAwakeState() {
        const keepAwake = this._settings.get_boolean('keep-awake');
        const effective = this._keepAwakeEffective ?? keepAwake;
        this._stateIcon.visible = effective;
        this._stateIconsBox.visible = effective || this._isAutohideEnabled();
        this._hostnameStateSpacer.visible = this._stateIconsBox.visible;
        this._stateIcon.remove_style_pseudo_class('active');

        if (effective)
            this._stateIcon.add_style_pseudo_class('active');

        if (this._keepAwakeItem.state !== keepAwake)
            this._keepAwakeItem.setToggleState(keepAwake);
        syncKeepAwakeControls(this._keepAwakeControls, this._settings);

        this._keepAwakeItem.label.remove_style_pseudo_class('active');
        if (keepAwake)
            this._keepAwakeItem.label.add_style_pseudo_class('active');
    }

    setKeepAwakeEffective(active) {
        this._keepAwakeEffective = active;
        this._syncKeepAwakeState();
    }

    _syncTopBarState() {
        syncSharedMenuSections(this);
    }

    _syncShowQuickSettingsState() {
        syncSharedMenuSections(this);
    }

    _isAutohideEnabled() {
        return this._settings.get_boolean('hide-topbar-fullscreen') ||
            this._settings.get_boolean('hide-topbar-maximized') ||
            this._settings.get_boolean('hide-topbar-touching');
    }

    _syncAutohideState() {
        const hideFullscreen = this._settings.get_boolean('hide-topbar-fullscreen');
        const hideMaximized = this._settings.get_boolean('hide-topbar-maximized');
        const hideTouching = this._settings.get_boolean('hide-topbar-touching');
        const autohideEnabled = hideFullscreen || hideMaximized || hideTouching;

        this._fullscreenIcon.visible = autohideEnabled;
        this._stateIconsBox.visible = autohideEnabled ||
            (this._keepAwakeEffective ?? this._settings.get_boolean('keep-awake'));
        this._hostnameStateSpacer.visible = this._stateIconsBox.visible;

        syncSharedMenuSections(this);
    }

    destroy() {
        this._settings.disconnectObject(this);

        this._desktopInterfaceSettings.disconnectObject(this);
        this._touchpadSettings.disconnectObject(this);
        this._disconnectSwitchItems();

        super.destroy();
    }

    _disconnectSwitchItems() {
        for (const item of this._switchItems)
            item.disconnectObject(this);

        this._switchItems = [];
    }
});

export default class UsernameAvatarExtension extends Extension {
    enable() {
        if (this._settings)
            return;

        configureMenuTranslation(this.gettext.bind(this));
        this._settings = this.getSettings();
        this._enabled = true;
        this._cancellable = new Gio.Cancellable();
        this._mediaPlaying = false;
        this._restoreKeepAwakeTimer();
        this._settings.connectObject('changed', (_settings, key) => {
            if (key === 'keep-awake' || key === 'keep-awake-fullscreen' ||
                key === 'keep-awake-media')
                this._syncInhibitor();

            if (key === 'keep-awake-timer-active' || key === 'keep-awake-timer-minutes') {
                this._resetKeepAwakeTimer(key === 'keep-awake-timer-minutes');
                this._syncInhibitor();
            }

            if (key === 'place-after-navigation') {
                this._rebuildButton();
                this._addMetricsButtons();
            }

            if (key === 'show-hostname' || key === 'show-username' || key === 'show-avatar' ||
                key === 'keep-awake' || key === 'show-topbar' || key === 'show-quick-settings' ||
                key === 'keep-awake-fullscreen' || key === 'keep-awake-media' ||
                key === 'keep-awake-timer-active' || key === 'keep-awake-timer-deadline' ||
                key === 'hide-topbar-fullscreen' || key === 'hide-topbar-fullscreen-all-monitors' ||
                key === 'hide-topbar-maximized' || key === 'hide-topbar-touching' ||
                LOAD_KEYS.includes(key) || TEMP_KEYS.includes(key) ||
                key === 'loads-position' || key === 'temps-position')
                this._refreshQuickSettingsMenu();

            if (key === 'show-topbar') {
                this._rebuildButton();
                this._addMetricsButtons();
            }

            if (key === 'show-quick-settings') {
                this._removeQuickSettingsMenu();
                this._addQuickSettingsMenu();
            }

            if (key === 'hide-topbar-fullscreen' || key === 'hide-topbar-fullscreen-all-monitors' ||
                key === 'hide-topbar-maximized' || key === 'hide-topbar-touching')
                this._syncFullscreenPanelVisibility();
        }, this);
        global.display.connectObject('in-fullscreen-changed', () => {
            this._syncFullscreenPanelVisibility();
            this._syncInhibitor();
        }, this);
        global.display.connectObject('notify::focus-window', () => {
            this._trackFocusWindow();
            this._syncFullscreenPanelVisibility();
            this._syncInhibitor();
        }, this);
        Main.layoutManager.connectObject('monitors-changed', () => {
            if (this._panelRevealActor) {
                this._destroyPanelRevealActor();
                this._ensurePanelRevealActor();
            }
            this._syncFullscreenPanelVisibility();
        }, this);
        this._startKeepAwakeRefreshTimer();
        this._setupPowerMonitor();
        this._startUserMonitors();

        this._trackFocusWindow();
        this._rebuildButton();
        this._addMetricsButtons();
        this._addQuickSettingsMenu();
        this._refreshQuickSettingsMenu();
        this._syncInhibitor();
        this._syncFullscreenPanelVisibility();
    }

    disable() {
        this._enabled = false;
        this._cancellable?.cancel();
        this._disconnectFocusWindowSignals();
        this._settings?.disconnectObject(this);
        global.display.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);

        if (this._keepAwakeTimeoutId) {
            GLib.Source.remove(this._keepAwakeTimeoutId);
            this._keepAwakeTimeoutId = null;
        }

        this._releaseInhibitor();
        this._destroyPanelRevealActor();
        this._setPanelAutohide(false);
        this._removeMetricsButtons();
        this._removeQuickSettingsMenu();
        this._button?.destroy();
        this._button = null;
        this._settings = null;
        this._cancellable = null;
        this._powerProxy?.disconnectObject(this);
        this._powerProxy = null;
        this._stopUserMonitors();
        textFileCache.clear();
        directoryCache.clear();
        gpuNameCache.clear();
        memoryHardwareCache = {timestamp: 0, value: null, pending: false};
        nvidiaMetricsCache = {timestamp: 0, ttl: 0, value: null, pending: false};
    }

    _startKeepAwakeRefreshTimer() {
        if (this._keepAwakeTimeoutId) {
            GLib.Source.remove(this._keepAwakeTimeoutId);
            this._keepAwakeTimeoutId = null;
        }

        this._keepAwakeTimeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            KEEP_AWAKE_REFRESH_SECONDS,
            () => {
                this._refreshAutomaticKeepAwake();
                return GLib.SOURCE_CONTINUE;
            }
        );
        GLib.Source.set_name_by_id(this._keepAwakeTimeoutId, `[${this.constructor.name}] keep-awake refresh`);
    }

    _rebuildButton() {
        this._button?.destroy();
        this._button = null;

        if (!this._settings.get_boolean('show-topbar'))
            return;

        this._button = new UserTopMenuButton(this._settings);
        Main.panel.addToStatusArea(this.uuid, this._button, this._getPanelPosition(), 'left');
        this._button.setKeepAwakeEffective(this._shouldKeepAwake());
    }

    _addMetricsButtons() {
        this._removeMetricsButtons();

        if (!this._settings.get_boolean('show-topbar'))
            return;

        this._leftMetrics = new SystemMetricsButton(this._settings, 'left', this.path);
        this._rightMetrics = new SystemMetricsButton(this._settings, 'right', this.path);
        Main.panel.addToStatusArea(`${this.uuid}-metrics-left`, this._leftMetrics, this._getPanelPosition() + 1, 'left');
        Main.panel.addToStatusArea(`${this.uuid}-metrics-right`, this._rightMetrics, 0, 'right');
    }

    _setupPowerMonitor() {
        Gio.DBusProxy.new_for_bus(
            Gio.BusType.SYSTEM,
            Gio.DBusProxyFlags.NONE,
            null,
            'org.freedesktop.UPower',
            '/org/freedesktop/UPower',
            'org.freedesktop.UPower',
            this._cancellable,
            (source, result) => {
                if (!this._enabled)
                    return;
                try {
                    this._powerProxy = Gio.DBusProxy.new_for_bus_finish(result);
                    const sync = () => {
                        systemOnBattery = this._powerProxy.get_cached_property('OnBattery')?.unpack() ?? false;
                        this._leftMetrics?.refreshTimerConfiguration();
                        this._rightMetrics?.refreshTimerConfiguration();
                    };
                    this._powerProxy.connectObject('g-properties-changed', sync, this);
                    sync();
                } catch (_error) {
                    systemOnBattery = false;
                }
            }
        );
    }

    _startUserMonitors() {
        this._stopUserMonitors();
        const userName = GLib.get_user_name();
        const directories = [
            '/var/lib/AccountsService/icons',
            '/var/lib/AccountsService/users',
        ];
        this._userMonitors = [];
        for (const path of directories) {
            try {
                const monitor = Gio.File.new_for_path(path).monitor_directory(
                    Gio.FileMonitorFlags.NONE,
                    this._cancellable
                );
                monitor.connectObject('changed', (_monitor, file) => {
                    if (this._enabled && file?.get_basename() === userName) {
                        this._rebuildButton();
                        this._removeQuickSettingsMenu();
                        this._addQuickSettingsMenu();
                    }
                }, this);
                this._userMonitors.push(monitor);
            } catch (_error) {
                // AccountsService files may not exist until an avatar is set.
            }
        }
    }

    _stopUserMonitors() {
        for (const monitor of this._userMonitors ?? []) {
            monitor.disconnectObject(this);
            monitor.cancel();
        }
        this._userMonitors = [];
    }

    _removeMetricsButtons() {
        this._leftMetrics?.destroy();
        this._rightMetrics?.destroy();
        this._leftMetrics = null;
        this._rightMetrics = null;
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
        const active = this._shouldKeepAwake();
        this._button?.setKeepAwakeEffective(active);

        if (active)
            this._inhibitIdle();
        else
            this._releaseInhibitor();
    }

    _shouldKeepAwake() {
        const manual = this._settings.get_boolean('keep-awake');
        const fullscreen = this._settings.get_boolean('keep-awake-fullscreen') &&
            Boolean(this._focusWindow?.fullscreen);
        const media = this._settings.get_boolean('keep-awake-media') && this._mediaPlaying;
        const timer = this._isKeepAwakeTimerActive();

        return manual || fullscreen || media || timer;
    }

    async _refreshAutomaticKeepAwake() {
        if (!this._settings || this._automaticRefreshPending)
            return;

        this._automaticRefreshPending = true;
        try {
            const watchMedia = this._settings.get_boolean('keep-awake-media');
            this._mediaPlaying = watchMedia
                ? await isMediaPlaying(this._cancellable)
                : false;

            if (!this._enabled || !this._settings)
                return;

            if (this._settings.get_boolean('keep-awake-timer-active') &&
                !this._isKeepAwakeTimerActive())
                this._settings.set_boolean('keep-awake-timer-active', false);

            this._syncInhibitor();
            this._refreshQuickSettingsMenu();
        } finally {
            this._automaticRefreshPending = false;
        }
    }

    _restoreKeepAwakeTimer() {
        if (!this._settings.get_boolean('keep-awake-timer-active')) {
            this._settings.set_int64('keep-awake-timer-deadline', 0);
            return;
        }

        const deadline = this._settings.get_int64('keep-awake-timer-deadline');
        if (timerIsActive(true, deadline, GLib.get_real_time()))
            return;

        if (deadline > 0) {
            this._settings.set_boolean('keep-awake-timer-active', false);
            this._settings.set_int64('keep-awake-timer-deadline', 0);
        } else {
            this._resetKeepAwakeTimer(true);
        }
    }

    _resetKeepAwakeTimer(forceRestart = false) {
        if (!this._settings?.get_boolean('keep-awake-timer-active')) {
            if (this._settings?.get_int64('keep-awake-timer-deadline') !== 0)
                this._settings?.set_int64('keep-awake-timer-deadline', 0);
            return;
        }

        const current = this._settings.get_int64('keep-awake-timer-deadline');
        if (!forceRestart && timerIsActive(true, current, GLib.get_real_time()))
            return;

        const duration = this._settings.get_uint('keep-awake-timer-minutes') * 60 * 1000000;
        this._settings.set_int64('keep-awake-timer-deadline', GLib.get_real_time() + duration);
    }

    _isKeepAwakeTimerActive() {
        return timerIsActive(
            this._settings?.get_boolean('keep-awake-timer-active'),
            this._settings?.get_int64('keep-awake-timer-deadline') ?? 0,
            GLib.get_real_time()
        );
    }

    async _inhibitIdle() {
        if (this._inhibitCookie || this._inhibitPending)
            return;

        if ((this._inhibitRetryAt ?? 0) > GLib.get_monotonic_time())
            return;

        this._inhibitPending = true;
        try {
            const result = await dbusCallAsync(
                Gio.DBus.session,
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
                3000
            );
            this._inhibitCookie = result.recursiveUnpack()[0];
            if (!this._enabled || !this._settings || !this._shouldKeepAwake())
                this._releaseInhibitor();
        } catch (error) {
            if (error.message.includes('org.freedesktop.DBus.Error.ServiceUnknown'))
                console.debug(`SessionManager unavailable; keep-awake deferred: ${error.message}`);
            else
                console.error(`Failed to inhibit idle: ${error.message}`);
            this._inhibitRetryAt = GLib.get_monotonic_time() + 60 * 1_000_000;
        } finally {
            this._inhibitPending = false;
        }
    }

    async _releaseInhibitor() {
        if (!this._inhibitCookie || this._uninhibitPending)
            return;

        const cookie = this._inhibitCookie;
        this._inhibitCookie = null;
        this._uninhibitPending = true;
        try {
            await dbusCallAsync(
                Gio.DBus.session,
                'org.gnome.SessionManager',
                '/org/gnome/SessionManager',
                'org.gnome.SessionManager',
                'Uninhibit',
                new GLib.Variant('(u)', [cookie]),
                null,
                3000
            );
        } catch (error) {
            console.error(`Failed to release idle inhibitor: ${error.message}`);
        } finally {
            this._uninhibitPending = false;
        }
    }

    _getDisplayName() {
        const realName = GLib.get_real_name();
        const userName = GLib.get_user_name();
        return realName && realName !== 'Unknown' ? realName : userName;
    }

    _trackFocusWindow() {
        this._disconnectFocusWindowSignals();
        this._focusWindow = global.display.focus_window;

        if (!this._focusWindow)
            return;

        this._focusWindow.connectObject(
            'notify::maximized-horizontally', () => {
                this._syncFullscreenPanelVisibility();
            },
            'notify::maximized-vertically', () => {
                this._syncFullscreenPanelVisibility();
            },
            'notify::fullscreen', () => {
                this._syncFullscreenPanelVisibility();
                this._syncInhibitor();
            },
            'position-changed', () => {
                this._syncFullscreenPanelVisibility();
            },
            'size-changed', () => {
                this._syncFullscreenPanelVisibility();
            },
            this
        );
    }

    _disconnectFocusWindowSignals() {
        if (!this._focusWindow)
            return;

        this._focusWindow.disconnectObject(this);
        this._focusWindow = null;
    }

    _syncFullscreenPanelVisibility() {
        const primary = Main.layoutManager.primaryMonitor;
        if (!primary || !Main.layoutManager.panelBox) {
            this._setPanelAutohide(false);
            return;
        }
        const frameRect = this._focusWindow?.get_frame_rect?.();
        const shouldHide = shouldHidePanel({
            fullscreen: this._settings?.get_boolean('hide-topbar-fullscreen'),
            fullscreenAllMonitors: this._settings?.get_boolean('hide-topbar-fullscreen-all-monitors'),
            maximized: this._settings?.get_boolean('hide-topbar-maximized'),
            touching: this._settings?.get_boolean('hide-topbar-touching'),
        }, this._focusWindow ? {
            fullscreen: Boolean(this._focusWindow.fullscreen),
            maximized: this._focusWindow.is_maximized?.() ?? false,
            monitor: this._focusWindow.get_monitor?.(),
            y: frameRect?.y ?? Number.MAX_SAFE_INTEGER,
        } : null, {
            index: global.display.get_primary_monitor(),
            y: primary.y,
            panelHeight: Main.layoutManager.panelBox.height,
        });

        this._setPanelAutohide(shouldHide);
    }

    _setPanelAutohide(hidden) {
        const panelBox = Main.layoutManager.panelBox;

        if (!panelBox)
            return;

        if (hidden) {
            if (this._panelAutohideActive) {
                if (!this._panelTemporarilyRevealed)
                    return;
                this._panelTemporarilyRevealed = false;
            } else {
                if (!panelBox.visible)
                    return;
                this._panelAutohideActive = true;
                if (!this._panelUntracked) {
                    Main.layoutManager.untrackChrome(panelBox);
                    this._panelUntracked = true;
                }
            }

            this._ensurePanelRevealActor();
            panelBox.ease({
                translation_y: -panelBox.height,
                duration: 180,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            if (!this._panelAutohideActive && !this._panelUntracked)
                return;

            this._panelAutohideActive = false;
            this._panelTemporarilyRevealed = false;
            panelBox.ease({
                translation_y: 0,
                duration: 150,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            this._destroyPanelRevealActor();

            if (this._panelUntracked) {
                Main.layoutManager.trackChrome(panelBox, {affectsStruts: true});
                this._panelUntracked = false;
            }
        }

    }

    _ensurePanelRevealActor() {
        if (this._panelRevealActor)
            return;

        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;
        this._panelRevealActor = new St.Widget({
            reactive: true,
            track_hover: true,
            style_class: 'user-topmenu-panel-reveal-edge',
        });
        this._panelRevealActor.set_position(monitor.x, monitor.y);
        this._panelRevealActor.set_size(monitor.width, 3);
        this._panelRevealActor.connectObject('enter-event', () => {
            const panelBox = Main.layoutManager.panelBox;
            this._panelTemporarilyRevealed = true;
            panelBox.ease({
                translation_y: 0,
                duration: 150,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            if (this._panelRevealTimeoutId)
                GLib.Source.remove(this._panelRevealTimeoutId);
            this._panelRevealTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                1800,
                () => {
                    this._panelRevealTimeoutId = null;
                    this._syncFullscreenPanelVisibility();
                    return GLib.SOURCE_REMOVE;
                }
            );
        }, this);
        Main.uiGroup.add_child(this._panelRevealActor);
    }

    _destroyPanelRevealActor() {
        if (this._panelRevealTimeoutId) {
            GLib.Source.remove(this._panelRevealTimeoutId);
            this._panelRevealTimeoutId = null;
        }
        this._panelRevealActor?.disconnectObject(this);
        this._panelRevealActor?.destroy();
        this._panelRevealActor = null;
    }

    _addQuickSettingsMenu() {
        const quickSettings = Main.panel.statusArea.quickSettings;

        this._removeQuickSettingsMenu();

        if (!quickSettings || !this._settings.get_boolean('show-quick-settings'))
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
