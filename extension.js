import St from 'gi://St';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const AVATAR_SIZE = 24;
const INHIBIT_IDLE_FLAG = 8;
const KEEP_AWAKE_REFRESH_SECONDS = 5;
const LOAD_KEYS = [
    'show-load-cpu',
    'show-load-mem',
    'show-load-swap',
    'show-load-igpu',
    'show-load-dgpu',
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
};
const NVIDIA_METRICS_CACHE_MS = 5000;
const NVIDIA_FAILURE_CACHE_MS = 60000;
let nvidiaMetricsCache = {timestamp: 0, ttl: 0, value: null};

function readTextFile(path) {
    try {
        const [ok, contents] = Gio.File.new_for_path(path).load_contents(null);

        if (ok)
            return new TextDecoder().decode(contents).trim();
    } catch (_error) {
        return null;
    }

    return null;
}

function readNumberFile(path) {
    const value = readTextFile(path);
    return value === null ? null : Number.parseInt(value, 10);
}

function listDirectory(path) {
    const names = [];

    try {
        const enumerator = Gio.File.new_for_path(path).enumerate_children(
            'standard::name',
            Gio.FileQueryInfoFlags.NONE,
            null
        );
        let info;

        while ((info = enumerator.next_file(null)))
            names.push(info.get_name());

        enumerator.close(null);
    } catch (_error) {
        return names;
    }

    return names;
}

function formatPercent(value) {
    return value === null || Number.isNaN(value) ? '--' : `${Math.round(value)}%`;
}

function getRoundedPercent(value) {
    return value === null || Number.isNaN(value) ? null : Math.max(0, Math.min(100, Math.round(value)));
}

function getTempColor(temp) {
    if (temp === null || Number.isNaN(temp))
        return '#9a9996';

    if (temp < 40)
        return '#57e389';

    if (temp < 60)
        return '#f8e45c';

    if (temp < 75)
        return '#ff7800';

    return '#e01b24';
}

function formatTemperature(temp, unit, decimals) {
    if (temp === null || Number.isNaN(temp))
        return unit === 'fahrenheit' ? '--°F' : '--°C';

    const value = unit === 'fahrenheit' ? temp * 9 / 5 + 32 : temp;
    return `${value.toFixed(decimals ? 1 : 0)}°${unit === 'fahrenheit' ? 'F' : 'C'}`;
}

function isMediaPlaying() {
    try {
        const namesResult = Gio.DBus.session.call_sync(
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            'org.freedesktop.DBus',
            'ListNames',
            null,
            new GLib.VariantType('(as)'),
            Gio.DBusCallFlags.NONE,
            1000,
            null
        );
        const [names] = namesResult.recursiveUnpack();

        for (const name of names.filter(value => value.startsWith('org.mpris.MediaPlayer2.'))) {
            try {
                const statusResult = Gio.DBus.session.call_sync(
                    name,
                    '/org/mpris/MediaPlayer2',
                    'org.freedesktop.DBus.Properties',
                    'Get',
                    new GLib.Variant('(ss)', ['org.mpris.MediaPlayer2.Player', 'PlaybackStatus']),
                    new GLib.VariantType('(v)'),
                    Gio.DBusCallFlags.NONE,
                    500,
                    null
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
    return `${Math.round(kib / 1024 / 1024)}GB`;
}

function formatBytes(bytes) {
    if (bytes === null || Number.isNaN(bytes))
        return '--';

    return `${Math.round(bytes / 1024 / 1024 / 1024)}GB`;
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

    return match?.[1] ?? GLib.get_host_name();
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

    if (devices.length > 1) {
        for (const device of devices) {
            if (device.vendor === '0x1002' && device.bootVga)
                device.type = 'igpu';
        }
    }

    return devices;
}

function getGpuByType(type) {
    return getGpuDevices().find(device => device.type === type) ?? null;
}

function getGpuMetrics(type) {
    if (type === 'dgpu') {
        const nvidia = getNvidiaMetrics();

        if (nvidia) {
            return {
                type: 'load',
                name: 'dGPU',
                percent: getRoundedPercent(nvidia.usage),
                color: LOAD_COLORS.dgpu,
                tooltip: `dGPU ${formatPercent(nvidia.usage)}\n${nvidia.usedMiB}/${nvidia.totalMiB}MB · ${nvidia.name}`,
            };
        }
    }

    const device = getGpuByType(type);

    if (!device)
        return null;

    const busy = readNumberFile(`${device.path}/gpu_busy_percent`);
    const used = readNumberFile(`${device.path}/mem_info_vram_used`);
    const total = readNumberFile(`${device.path}/mem_info_vram_total`);
    const usage = used !== null && total ? used / total * 100 : busy;

    return {
        type: 'load',
        name: type === 'igpu' ? 'iGPU' : 'dGPU',
        percent: getRoundedPercent(usage),
        color: LOAD_COLORS[type],
        tooltip: [
            `${type === 'igpu' ? 'iGPU' : 'dGPU'} ${formatPercent(usage)}`,
            total ? `${formatBytes(used)}/${formatBytes(total)}` : device.name,
        ].join('\n'),
    };
}

function getNvidiaMetrics() {
    const now = GLib.get_monotonic_time() / 1000;

    if (now - nvidiaMetricsCache.timestamp < nvidiaMetricsCache.ttl)
        return nvidiaMetricsCache.value;

    // Never let polling initialize or probe a dormant NVIDIA driver. Calling
    // nvidia-smi too early can repeatedly trigger a failing modprobe on
    // unsupported or misconfigured hybrid-GPU systems.
    const driverReady =
        GLib.file_test('/sys/module/nvidia', GLib.FileTest.IS_DIR) &&
        GLib.file_test('/dev/nvidiactl', GLib.FileTest.EXISTS) &&
        GLib.file_test('/proc/driver/nvidia/gpus', GLib.FileTest.IS_DIR) &&
        listDirectory('/proc/driver/nvidia/gpus').length > 0;

    if (!driverReady) {
        nvidiaMetricsCache = {timestamp: now, ttl: NVIDIA_FAILURE_CACHE_MS, value: null};
        return null;
    }

    let value = null;

    try {
        const process = Gio.Subprocess.new([
            'nvidia-smi',
            '--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,name',
            '--format=csv,noheader,nounits',
        ], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
        const [, stdout] = process.communicate_utf8(null, null);
        const fields = stdout.trim().split('\n')[0]?.split(',').map(field => field.trim());

        if (process.get_successful() && fields?.length >= 5) {
            value = {
                usage: Number.parseInt(fields[0], 10),
                usedMiB: Number.parseInt(fields[1], 10),
                totalMiB: Number.parseInt(fields[2], 10),
                temp: Number.parseInt(fields[3], 10),
                name: fields.slice(4).join(', '),
            };
        }
    } catch (_error) {
        value = null;
    }

    nvidiaMetricsCache = {
        timestamp: now,
        ttl: value ? NVIDIA_METRICS_CACHE_MS : NVIDIA_FAILURE_CACHE_MS,
        value,
    };
    return value;
}

function getHwmonTemperature(devicePath) {
    for (const hwmon of listDirectory(`${devicePath}/hwmon`)) {
        const hwmonPath = `${devicePath}/hwmon/${hwmon}`;

        for (const fileName of listDirectory(hwmonPath).filter(name => /^temp\d+_input$/.test(name))) {
            const value = readNumberFile(`${hwmonPath}/${fileName}`);

            if (value !== null)
                return value / 1000;
        }
    }

    return null;
}

function getGpuTemperature(type) {
    if (type === 'dgpu') {
        const nvidia = getNvidiaMetrics();

        if (nvidia && !Number.isNaN(nvidia.temp))
            return nvidia.temp;
    }

    const device = getGpuByType(type);

    if (!device)
        return null;

    return getHwmonTemperature(device.path);
}

function getCpuTemperature() {
    for (const hwmon of listDirectory('/sys/class/hwmon')) {
        const hwmonPath = `/sys/class/hwmon/${hwmon}`;
        const labels = listDirectory(hwmonPath).filter(name => /^temp\d+_label$/.test(name));
        const preferred = labels.find(label => {
            const text = readTextFile(`${hwmonPath}/${label}`)?.toLowerCase() ?? '';
            return text.includes('package') || text.includes('tctl') || text.includes('cpu');
        });
        const inputName = preferred?.replace('_label', '_input') ??
            listDirectory(hwmonPath).find(name => /^temp\d+_input$/.test(name));
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
    _init(settings, side) {
        super._init(0.0, `Username Avatar ${side} Metrics`, false);

        this._settings = settings;
        this._side = side;
        this._cpuModel = getCpuModel();
        this._previousCpuStat = parseCpuStat();
        this._box = new St.BoxLayout({
            style_class: 'user-topmenu-metrics-box',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._box.spacing = 12;
        this.add_child(this._box);
        this.menu.actor.visible = false;
        this._tooltip = new St.Label({
            style_class: 'user-topmenu-metric-tooltip',
            visible: false,
        });
        Main.uiGroup.add_child(this._tooltip);

        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (LOAD_KEYS.includes(key) || TEMP_KEYS.includes(key) ||
                key === 'loads-position' || key === 'temps-position' ||
                key === 'temperature-unit' || key === 'temperature-decimals')
                this._refresh();

            if (key === 'metrics-refresh-seconds')
                this._startRefreshTimer();
        });
        this._startRefreshTimer();

        this._refresh();
    }

    _startRefreshTimer() {
        if (this._timeoutId)
            GLib.Source.remove(this._timeoutId);

        const seconds = this._settings.get_uint('metrics-refresh-seconds');
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
        GLib.Source.set_name_by_id(this._timeoutId, `[${this.constructor.name}] refresh`);
    }

    destroy() {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }

        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        this._tooltip?.destroy();
        this._tooltip = null;

        super.destroy();
    }

    _refresh() {
        this._box.destroy_all_children();

        const firstGroup = this._side === 'left'
            ? this._getItemsForGroup('loads')
            : this._getItemsForGroup('temps');
        const secondGroup = this._side === 'left'
            ? this._getItemsForGroup('temps')
            : this._getItemsForGroup('loads');

        for (const item of firstGroup)
            this._box.add_child(this._createMetricLabel(item));

        if (firstGroup.length > 0 && secondGroup.length > 0)
            this._box.add_child(new St.Widget({width: 8}));

        for (const item of secondGroup)
            this._box.add_child(this._createMetricLabel(item));

        this.visible = firstGroup.length + secondGroup.length > 0;
    }

    _getItemsForGroup(group) {
        if (this._settings.get_string(`${group}-position`) !== this._side)
            return [];

        return group === 'loads' ? this._getLoadItems() : this._getTempItems();
    }

    _getLoadItems() {
        const items = [];

        if (this._settings.get_boolean('show-load-cpu'))
            items.push(this._getCpuLoadItem());

        if (this._settings.get_boolean('show-load-mem'))
            items.push(this._getMemoryItem());

        if (this._settings.get_boolean('show-load-swap'))
            items.push(this._getSwapItem());

        if (this._settings.get_boolean('show-load-igpu'))
            items.push(getGpuMetrics('igpu') ?? {
                type: 'load',
                name: 'iGPU',
                percent: null,
                color: LOAD_COLORS.igpu,
                tooltip: 'iGPU unavailable',
            });

        if (this._settings.get_boolean('show-load-dgpu'))
            items.push(getGpuMetrics('dgpu') ?? {
                type: 'load',
                name: 'dGPU',
                percent: null,
                color: LOAD_COLORS.dgpu,
                tooltip: 'dGPU unavailable',
            });

        return items;
    }

    _getTempItems() {
        const items = [];

        if (this._settings.get_boolean('show-temp-cpu')) {
            const temp = getCpuTemperature();
            const formatted = this._formatTemperature(temp);
            items.push({
                type: 'temp',
                name: 'CPU',
                temp,
                color: getTempColor(temp),
                tooltip: `CPU ${temp === null ? 'unavailable' : formatted}\n${this._cpuModel}`,
            });
        }

        if (this._settings.get_boolean('show-temp-igpu')) {
            const temp = getGpuTemperature('igpu');
            const formatted = this._formatTemperature(temp);
            items.push({
                type: 'temp',
                name: 'iGPU',
                temp,
                color: getTempColor(temp),
                tooltip: `iGPU ${temp === null ? 'unavailable' : formatted}`,
            });
        }

        if (this._settings.get_boolean('show-temp-dgpu')) {
            const temp = getGpuTemperature('dgpu');
            const formatted = this._formatTemperature(temp);
            items.push({
                type: 'temp',
                name: 'dGPU',
                temp,
                color: getTempColor(temp),
                tooltip: `dGPU ${temp === null ? 'unavailable' : formatted}`,
            });
        }

        return items;
    }

    _getCpuLoadItem() {
        const current = parseCpuStat();
        let percent = null;

        if (current && this._previousCpuStat) {
            const totalDelta = current.total - this._previousCpuStat.total;
            const idleDelta = current.idle - this._previousCpuStat.idle;

            if (totalDelta > 0)
                percent = (1 - idleDelta / totalDelta) * 100;
        }

        if (current)
            this._previousCpuStat = current;

        return {
            type: 'load',
            name: 'CPU',
            percent: getRoundedPercent(percent),
            color: LOAD_COLORS.cpu,
            tooltip: `CPU ${formatPercent(percent)}\n${this._cpuModel}`,
        };
    }

    _getMemoryItem() {
        const meminfo = parseMeminfo();
        const total = meminfo.MemTotal ?? 0;
        const available = meminfo.MemAvailable ?? 0;
        const used = Math.max(total - available, 0);
        const percent = total ? used / total * 100 : null;

        return {
            type: 'load',
            name: 'MEM',
            percent: getRoundedPercent(percent),
            color: LOAD_COLORS.mem,
            tooltip: `MEM ${formatPercent(percent)}\n${formatGiB(used)}/${formatGiB(total)}`,
        };
    }

    _getSwapItem() {
        const meminfo = parseMeminfo();
        const total = meminfo.SwapTotal ?? 0;
        const free = meminfo.SwapFree ?? 0;
        const used = Math.max(total - free, 0);
        const percent = total ? used / total * 100 : null;

        return {
            type: 'load',
            name: 'SWAP',
            percent: getRoundedPercent(percent),
            color: LOAD_COLORS.swap,
            tooltip: `SWAP ${formatPercent(percent)}\n${formatGiB(used)}/${formatGiB(total)}`,
        };
    }

    _createMetricLabel(item) {
        const actor = item.type === 'temp'
            ? this._createTempMetric(item)
            : this._createLoadMetric(item);

        actor.connect('enter-event', () => {
            this._showTooltip(actor, item.tooltip);
        });
        actor.connect('leave-event', () => {
            this._hideTooltip();
        });
        return actor;
    }

    _createLoadMetric(item) {
        const metric = new St.BoxLayout({
            style_class: 'user-topmenu-load-metric',
            reactive: true,
            style: 'margin-left: 5px; margin-right: 5px;',
            y_align: Clutter.ActorAlign.CENTER,
        });
        metric.spacing = 5;

        const iconBox = new St.BoxLayout({
            y_align: Clutter.ActorAlign.CENTER,
        });
        iconBox.spacing = 2;
        const icon = new St.Icon({
            icon_name: this._getLoadIconName(item.name),
            style: `color: ${item.color};`,
            icon_size: 14,
            y_align: Clutter.ActorAlign.CENTER,
        });
        iconBox.add_child(icon);

        const qualifier = this._getLoadIconQualifier(item.name);
        if (qualifier) {
            iconBox.add_child(new St.Label({
                text: qualifier,
                style: `color: ${item.color}; font-size: 8px; font-weight: bold;`,
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
            style: `background-color: ${item.color}; border-radius: 2px;`,
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
            return 'applications-system-symbolic';
        case 'MEM':
            return 'media-flash-symbolic';
        case 'SWAP':
            return 'object-flip-horizontal-symbolic';
        case 'iGPU':
            return 'video-display-symbolic';
        case 'dGPU':
            return 'video-display-symbolic';
        default:
            return 'applications-system-symbolic';
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
            style: 'margin-left: 5px; margin-right: 5px;',
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.spacing = 5;

        const icon = new St.Icon({
            icon_name: 'temperature-symbolic',
            style: `color: ${item.color};`,
            icon_size: 13,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const label = new St.Label({
            text: this._formatTemperature(item.temp),
            style_class: 'user-topmenu-temp-label',
            style: `color: ${item.color};`,
            y_align: Clutter.ActorAlign.CENTER,
        });

        box.add_child(icon);
        box.add_child(label);
        box.accessible_name = `${item.name} ${item.temp === null ? 'temperature unavailable' : this._formatTemperature(item.temp)}`;
        return box;
    }

    _formatTemperature(temp) {
        return formatTemperature(
            temp,
            this._settings.get_string('temperature-unit'),
            this._settings.get_boolean('temperature-decimals')
        );
    }

    _showTooltip(actor, text) {
        if (!this._tooltip)
            return;

        this._tooltip.set_text(text);
        this._tooltip.visible = true;

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

        this.menu.setHeader('avatar-default-symbolic', extension._getDisplayName(), null);

        this._keepAwakeItem = new PopupMenu.PopupSwitchMenuItem(
            'Keep awake',
            this._settings.get_boolean('keep-awake')
        );
        this._keepAwakeToggledId = this._keepAwakeItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('keep-awake', state);
        });
        this.menu.addMenuItem(this._keepAwakeItem);

        this._displaySubmenu = new PopupMenu.PopupSubMenuMenuItem('Display');
        this.menu.addMenuItem(this._displaySubmenu);

        this._showHostnameItem = new PopupMenu.PopupSwitchMenuItem(
            'Show computer name',
            this._settings.get_boolean('show-hostname')
        );
        this._showHostnameToggledId = this._showHostnameItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('show-hostname', state);
        });
        this._displaySubmenu.menu.addMenuItem(this._showHostnameItem);

        this._showUsernameItem = new PopupMenu.PopupSwitchMenuItem(
            'Display username',
            this._settings.get_boolean('show-username')
        );
        this._showUsernameToggledId = this._showUsernameItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('show-username', state);
        });
        this._displaySubmenu.menu.addMenuItem(this._showUsernameItem);

        this._showAvatarItem = new PopupMenu.PopupSwitchMenuItem(
            'Display avatar',
            this._settings.get_boolean('show-avatar')
        );
        this._showAvatarToggledId = this._showAvatarItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('show-avatar', state);
        });
        this._displaySubmenu.menu.addMenuItem(this._showAvatarItem);

        this._desktopSubmenu = new PopupMenu.PopupSubMenuMenuItem('Desktop');
        this.menu.addMenuItem(this._desktopSubmenu);

        this._primaryPasteItem = new PopupMenu.PopupSwitchMenuItem(
            'Enable primary paste',
            this._desktopInterfaceSettings.get_boolean('gtk-enable-primary-paste')
        );
        this._primaryPasteToggledId = this._primaryPasteItem.connect('toggled', (_item, state) => {
            this._desktopInterfaceSettings.set_boolean('gtk-enable-primary-paste', state);
        });
        this._desktopSubmenu.menu.addMenuItem(this._primaryPasteItem);

        this._touchpadMiddleClickItem = new PopupMenu.PopupSwitchMenuItem(
            'Three-finger middle click',
            this._touchpadSettings.get_string('tap-button-map') === 'lrm'
        );
        this._touchpadMiddleClickToggledId = this._touchpadMiddleClickItem.connect('toggled', (_item, state) => {
            this._touchpadSettings.set_string('tap-button-map', state ? 'lrm' : 'default');
        });
        this._desktopSubmenu.menu.addMenuItem(this._touchpadMiddleClickItem);

        this._behaviorSubmenu = new PopupMenu.PopupSubMenuMenuItem('Extension');
        this.menu.addMenuItem(this._behaviorSubmenu);

        this._showQuickSettingsItem = new PopupMenu.PopupSwitchMenuItem(
            'Show in quick settings',
            this._settings.get_boolean('show-quick-settings')
        );
        this._showQuickSettingsToggledId = this._showQuickSettingsItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('show-quick-settings', state);
        });
        this._behaviorSubmenu.menu.addMenuItem(this._showQuickSettingsItem);

        this._quickSettingsToggleModeItem = new PopupMenu.PopupSwitchMenuItem(
            'Clicking username disables extension',
            !this._settings.get_boolean('quick-settings-toggle-topbar-only')
        );
        this._quickSettingsToggleModeToggledId = this._quickSettingsToggleModeItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('quick-settings-toggle-topbar-only', !state);
        });
        this._behaviorSubmenu.menu.addMenuItem(this._quickSettingsToggleModeItem);

        this._autohideSubmenu = new PopupMenu.PopupSubMenuMenuItem('Autohide');
        this.menu.addMenuItem(this._autohideSubmenu);

        this._hideFullscreenItem = new PopupMenu.PopupSwitchMenuItem(
            'Hide in fullscreen',
            this._settings.get_boolean('hide-topbar-fullscreen')
        );
        this._hideFullscreenToggledId = this._hideFullscreenItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('hide-topbar-fullscreen', state);
        });
        this._autohideSubmenu.menu.addMenuItem(this._hideFullscreenItem);

        this._hideFullscreenAllMonitorsItem = new PopupMenu.PopupSwitchMenuItem(
            'Fullscreen on all monitors',
            this._settings.get_boolean('hide-topbar-fullscreen-all-monitors')
        );
        this._hideFullscreenAllMonitorsToggledId = this._hideFullscreenAllMonitorsItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('hide-topbar-fullscreen-all-monitors', state);
        });
        this._autohideSubmenu.menu.addMenuItem(this._hideFullscreenAllMonitorsItem);

        this._hideMaximizedItem = new PopupMenu.PopupSwitchMenuItem(
            'Hide when maximized',
            this._settings.get_boolean('hide-topbar-maximized')
        );
        this._hideMaximizedToggledId = this._hideMaximizedItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('hide-topbar-maximized', state);
        });
        this._autohideSubmenu.menu.addMenuItem(this._hideMaximizedItem);

        this._hideTouchingItem = new PopupMenu.PopupSwitchMenuItem(
            'Hide when touching top bar',
            this._settings.get_boolean('hide-topbar-touching')
        );
        this._hideTouchingToggledId = this._hideTouchingItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('hide-topbar-touching', state);
        });
        this._autohideSubmenu.menu.addMenuItem(this._hideTouchingItem);

        this._desktopInterfaceChangedId = this._desktopInterfaceSettings.connect('changed::gtk-enable-primary-paste', () => {
            this._syncDesktopState();
        });
        this._touchpadSettingsChangedId = this._touchpadSettings.connect('changed::tap-button-map', () => {
            this._syncDesktopState();
        });

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction('Open Preferences', () => {
            this._extension.openPreferences().catch(error => {
                console.error(`Failed to open preferences: ${error.message}`);
            });
        });
        this.menu.addAction('Lock Screen', () => {
            Util.spawn(['loginctl', 'lock-session']);
        });
        this.menu.addAction('Log Out', () => {
            Util.spawn(['gnome-session-quit', '--logout', '--no-prompt']);
        });

        this.connect('clicked', () => {
            if (this._syncingChecked)
                return;

            if (this._settings.get_boolean('quick-settings-toggle-topbar-only')) {
                const nextState = !this._settings.get_boolean('show-topbar');
                this._settings.set_boolean('show-topbar', nextState);
                return;
            }

            Util.spawn([
                'gnome-extensions',
                'disable',
                this._extension.uuid,
            ]);
        });

        this.sync();
    }

    sync() {
        const keepAwake = this._settings.get_boolean('keep-awake');
        const showHostname = this._settings.get_boolean('show-hostname');
        const showUsername = this._settings.get_boolean('show-username');
        const showAvatar = this._settings.get_boolean('show-avatar');
        const showTopBar = this._settings.get_boolean('show-topbar');
        const showQuickSettings = this._settings.get_boolean('show-quick-settings');
        const quickSettingsToggleTopbarOnly = this._settings.get_boolean('quick-settings-toggle-topbar-only');
        const hideFullscreen = this._settings.get_boolean('hide-topbar-fullscreen');
        const hideFullscreenAllMonitors = this._settings.get_boolean('hide-topbar-fullscreen-all-monitors');
        const hideMaximized = this._settings.get_boolean('hide-topbar-maximized');
        const hideTouching = this._settings.get_boolean('hide-topbar-touching');
        const displayName = this._extension._getDisplayName();

        this.title = displayName;
        this._syncingChecked = true;
        this.checked = quickSettingsToggleTopbarOnly ? showTopBar : true;
        this._syncingChecked = false;
        this.menu.setHeader(
            'avatar-default-symbolic',
            displayName,
            quickSettingsToggleTopbarOnly
                ? (showTopBar ? 'Shown in top bar' : 'Hidden from top bar')
                : 'Click to disable the extension'
        );

        if (this._keepAwakeItem.state !== keepAwake)
            this._keepAwakeItem.setToggleState(keepAwake);

        if (this._showHostnameItem.state !== showHostname)
            this._showHostnameItem.setToggleState(showHostname);

        if (this._showUsernameItem.state !== showUsername)
            this._showUsernameItem.setToggleState(showUsername);

        if (this._showAvatarItem.state !== showAvatar)
            this._showAvatarItem.setToggleState(showAvatar);

        if (this._showQuickSettingsItem.state !== showQuickSettings)
            this._showQuickSettingsItem.setToggleState(showQuickSettings);

        if (this._quickSettingsToggleModeItem.state === quickSettingsToggleTopbarOnly)
            this._quickSettingsToggleModeItem.setToggleState(!quickSettingsToggleTopbarOnly);

        this._syncDesktopState();

        if (this._hideFullscreenItem.state !== hideFullscreen)
            this._hideFullscreenItem.setToggleState(hideFullscreen);

        if (this._hideFullscreenAllMonitorsItem.state !== hideFullscreenAllMonitors)
            this._hideFullscreenAllMonitorsItem.setToggleState(hideFullscreenAllMonitors);

        if (this._hideMaximizedItem.state !== hideMaximized)
            this._hideMaximizedItem.setToggleState(hideMaximized);

        if (this._hideTouchingItem.state !== hideTouching)
            this._hideTouchingItem.setToggleState(hideTouching);
    }

    destroy() {
        if (this._desktopInterfaceChangedId) {
            this._desktopInterfaceSettings.disconnect(this._desktopInterfaceChangedId);
            this._desktopInterfaceChangedId = null;
        }

        if (this._touchpadSettingsChangedId) {
            this._touchpadSettings.disconnect(this._touchpadSettingsChangedId);
            this._touchpadSettingsChangedId = null;
        }

        if (this._keepAwakeToggledId) {
            this._keepAwakeItem.disconnect(this._keepAwakeToggledId);
            this._keepAwakeToggledId = null;
        }

        if (this._showHostnameToggledId) {
            this._showHostnameItem.disconnect(this._showHostnameToggledId);
            this._showHostnameToggledId = null;
        }

        if (this._showUsernameToggledId) {
            this._showUsernameItem.disconnect(this._showUsernameToggledId);
            this._showUsernameToggledId = null;
        }

        if (this._showAvatarToggledId) {
            this._showAvatarItem.disconnect(this._showAvatarToggledId);
            this._showAvatarToggledId = null;
        }

        if (this._primaryPasteToggledId) {
            this._primaryPasteItem.disconnect(this._primaryPasteToggledId);
            this._primaryPasteToggledId = null;
        }

        if (this._touchpadMiddleClickToggledId) {
            this._touchpadMiddleClickItem.disconnect(this._touchpadMiddleClickToggledId);
            this._touchpadMiddleClickToggledId = null;
        }

        if (this._showQuickSettingsToggledId) {
            this._showQuickSettingsItem.disconnect(this._showQuickSettingsToggledId);
            this._showQuickSettingsToggledId = null;
        }

        if (this._quickSettingsToggleModeToggledId) {
            this._quickSettingsToggleModeItem.disconnect(this._quickSettingsToggleModeToggledId);
            this._quickSettingsToggleModeToggledId = null;
        }

        if (this._hideFullscreenToggledId) {
            this._hideFullscreenItem.disconnect(this._hideFullscreenToggledId);
            this._hideFullscreenToggledId = null;
        }

        if (this._hideFullscreenAllMonitorsToggledId) {
            this._hideFullscreenAllMonitorsItem.disconnect(this._hideFullscreenAllMonitorsToggledId);
            this._hideFullscreenAllMonitorsToggledId = null;
        }

        if (this._hideMaximizedToggledId) {
            this._hideMaximizedItem.disconnect(this._hideMaximizedToggledId);
            this._hideMaximizedToggledId = null;
        }

        if (this._hideTouchingToggledId) {
            this._hideTouchingItem.disconnect(this._hideTouchingToggledId);
            this._hideTouchingToggledId = null;
        }

        super.destroy();
    }

    _syncDesktopState() {
        const primaryPaste = this._desktopInterfaceSettings.get_boolean('gtk-enable-primary-paste');
        const touchpadMiddleClick = this._touchpadSettings.get_string('tap-button-map') === 'lrm';

        if (this._primaryPasteItem.state !== primaryPaste)
            this._primaryPasteItem.setToggleState(primaryPaste);

        if (this._touchpadMiddleClickItem.state !== touchpadMiddleClick)
            this._touchpadMiddleClickItem.setToggleState(touchpadMiddleClick);
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
            visible: false,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._stateIcon = new St.Icon({
            icon_name: 'weather-clear-symbolic',
            style_class: 'user-topmenu-state-icon',
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

        this._keepAwakeItem = new PopupMenu.PopupSwitchMenuItem(
            'Keep awake',
            this._settings.get_boolean('keep-awake')
        );
        this._keepAwakeToggledId = this._keepAwakeItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('keep-awake', state);
        });
        this.menu.addMenuItem(this._keepAwakeItem);

        this._displaySubmenu = new PopupMenu.PopupSubMenuMenuItem('Display');
        this.menu.addMenuItem(this._displaySubmenu);

        this._showTopBarItem = new PopupMenu.PopupSwitchMenuItem(
            'Show in top bar',
            this._settings.get_boolean('show-topbar')
        );
        this._showTopBarToggledId = this._showTopBarItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('show-topbar', state);
        });
        this._displaySubmenu.menu.addMenuItem(this._showTopBarItem);

        this._showHostnameItem = new PopupMenu.PopupSwitchMenuItem(
            'Show computer name',
            this._settings.get_boolean('show-hostname')
        );
        this._showHostnameToggledId = this._showHostnameItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('show-hostname', state);
        });
        this._displaySubmenu.menu.addMenuItem(this._showHostnameItem);

        this._showUsernameItem = new PopupMenu.PopupSwitchMenuItem(
            'Display username',
            this._settings.get_boolean('show-username')
        );
        this._showUsernameToggledId = this._showUsernameItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('show-username', state);
        });
        this._displaySubmenu.menu.addMenuItem(this._showUsernameItem);

        this._showAvatarItem = new PopupMenu.PopupSwitchMenuItem(
            'Display avatar',
            this._settings.get_boolean('show-avatar')
        );
        this._showAvatarToggledId = this._showAvatarItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('show-avatar', state);
        });
        this._displaySubmenu.menu.addMenuItem(this._showAvatarItem);

        this._desktopSubmenu = new PopupMenu.PopupSubMenuMenuItem('Desktop');
        this.menu.addMenuItem(this._desktopSubmenu);

        this._primaryPasteItem = new PopupMenu.PopupSwitchMenuItem(
            'Enable primary paste',
            this._desktopInterfaceSettings.get_boolean('gtk-enable-primary-paste')
        );
        this._primaryPasteToggledId = this._primaryPasteItem.connect('toggled', (_item, state) => {
            this._desktopInterfaceSettings.set_boolean('gtk-enable-primary-paste', state);
        });
        this._desktopSubmenu.menu.addMenuItem(this._primaryPasteItem);

        this._touchpadMiddleClickItem = new PopupMenu.PopupSwitchMenuItem(
            'Three-finger middle click',
            this._touchpadSettings.get_string('tap-button-map') === 'lrm'
        );
        this._touchpadMiddleClickToggledId = this._touchpadMiddleClickItem.connect('toggled', (_item, state) => {
            this._touchpadSettings.set_string('tap-button-map', state ? 'lrm' : 'default');
        });
        this._desktopSubmenu.menu.addMenuItem(this._touchpadMiddleClickItem);

        this._behaviorSubmenu = new PopupMenu.PopupSubMenuMenuItem('Extension');
        this.menu.addMenuItem(this._behaviorSubmenu);

        this._showQuickSettingsItem = new PopupMenu.PopupSwitchMenuItem(
            'Show in quick settings',
            this._settings.get_boolean('show-quick-settings')
        );
        this._showQuickSettingsToggledId = this._showQuickSettingsItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('show-quick-settings', state);
        });
        this._behaviorSubmenu.menu.addMenuItem(this._showQuickSettingsItem);

        this._quickSettingsToggleModeItem = new PopupMenu.PopupSwitchMenuItem(
            'Clicking username disables extension',
            !this._settings.get_boolean('quick-settings-toggle-topbar-only')
        );
        this._quickSettingsToggleModeToggledId = this._quickSettingsToggleModeItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('quick-settings-toggle-topbar-only', !state);
        });
        this._behaviorSubmenu.menu.addMenuItem(this._quickSettingsToggleModeItem);

        this._autohideSubmenu = new PopupMenu.PopupSubMenuMenuItem('Autohide');
        this.menu.addMenuItem(this._autohideSubmenu);

        this._hideFullscreenItem = new PopupMenu.PopupSwitchMenuItem(
            'Hide in fullscreen',
            this._settings.get_boolean('hide-topbar-fullscreen')
        );
        this._hideFullscreenToggledId = this._hideFullscreenItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('hide-topbar-fullscreen', state);
        });
        this._autohideSubmenu.menu.addMenuItem(this._hideFullscreenItem);

        this._hideFullscreenAllMonitorsItem = new PopupMenu.PopupSwitchMenuItem(
            'Fullscreen on all monitors',
            this._settings.get_boolean('hide-topbar-fullscreen-all-monitors')
        );
        this._hideFullscreenAllMonitorsToggledId = this._hideFullscreenAllMonitorsItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('hide-topbar-fullscreen-all-monitors', state);
        });
        this._autohideSubmenu.menu.addMenuItem(this._hideFullscreenAllMonitorsItem);

        this._hideMaximizedItem = new PopupMenu.PopupSwitchMenuItem(
            'Hide when maximized',
            this._settings.get_boolean('hide-topbar-maximized')
        );
        this._hideMaximizedToggledId = this._hideMaximizedItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('hide-topbar-maximized', state);
        });
        this._autohideSubmenu.menu.addMenuItem(this._hideMaximizedItem);

        this._hideTouchingItem = new PopupMenu.PopupSwitchMenuItem(
            'Hide when touching top bar',
            this._settings.get_boolean('hide-topbar-touching')
        );
        this._hideTouchingToggledId = this._hideTouchingItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('hide-topbar-touching', state);
        });
        this._autohideSubmenu.menu.addMenuItem(this._hideTouchingItem);

        this._desktopInterfaceChangedId = this._desktopInterfaceSettings.connect('changed::gtk-enable-primary-paste', () => {
            this._syncDesktopState();
        });
        this._touchpadSettingsChangedId = this._touchpadSettings.connect('changed::tap-button-map', () => {
            this._syncDesktopState();
        });
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction('Lock Screen', () => {
            Util.spawn(['loginctl', 'lock-session']);
        });

        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (key === 'show-hostname' || key === 'show-username' || key === 'show-avatar')
                this._refreshLabel();

            if (key === 'keep-awake')
                this._syncKeepAwakeState();

            if (key === 'show-topbar')
                this._syncTopBarState();

            if (key === 'show-quick-settings')
                this._syncShowQuickSettingsState();

            if (key === 'quick-settings-toggle-topbar-only')
                this._syncQuickSettingsToggleModeState();

            if (key === 'hide-topbar-fullscreen' || key === 'hide-topbar-fullscreen-all-monitors' ||
                key === 'hide-topbar-maximized' || key === 'hide-topbar-touching')
                this._syncAutohideState();
        });

        this._refreshLabel();
        this._syncKeepAwakeState();
        this._syncTopBarState();
        this._syncShowQuickSettingsState();
        this._syncQuickSettingsToggleModeState();
        this._syncAutohideState();
        this._syncDesktopState();
    }

    _createAvatarActor(userName) {
        const avatarPath = `/var/lib/AccountsService/icons/${userName}`;

        if (GLib.file_test(avatarPath, GLib.FileTest.EXISTS)) {
            return new St.Icon({
                gicon: new Gio.FileIcon({file: Gio.File.new_for_path(avatarPath)}),
                icon_size: AVATAR_SIZE,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
        }

        return new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            child: new St.Icon({
                gicon: new Gio.ThemedIcon({name: 'avatar-default-symbolic'}),
                icon_size: AVATAR_SIZE,
                y_align: Clutter.ActorAlign.CENTER,
            }),
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

        this._avatarFrame.visible = showAvatar;
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

        this._keepAwakeItem.label.remove_style_pseudo_class('active');
        if (keepAwake)
            this._keepAwakeItem.label.add_style_pseudo_class('active');
    }

    setKeepAwakeEffective(active) {
        this._keepAwakeEffective = active;
        this._syncKeepAwakeState();
    }

    _syncTopBarState() {
        const showTopBar = this._settings.get_boolean('show-topbar');

        if (this._showTopBarItem.state !== showTopBar)
            this._showTopBarItem.setToggleState(showTopBar);
    }

    _syncShowQuickSettingsState() {
        const showQuickSettings = this._settings.get_boolean('show-quick-settings');

        if (this._showQuickSettingsItem.state !== showQuickSettings)
            this._showQuickSettingsItem.setToggleState(showQuickSettings);
    }

    _syncQuickSettingsToggleModeState() {
        const topbarOnly = this._settings.get_boolean('quick-settings-toggle-topbar-only');

        if (this._quickSettingsToggleModeItem.state === topbarOnly)
            this._quickSettingsToggleModeItem.setToggleState(!topbarOnly);
    }

    _syncDesktopState() {
        const primaryPaste = this._desktopInterfaceSettings.get_boolean('gtk-enable-primary-paste');
        const touchpadMiddleClick = this._touchpadSettings.get_string('tap-button-map') === 'lrm';

        if (this._primaryPasteItem.state !== primaryPaste)
            this._primaryPasteItem.setToggleState(primaryPaste);

        if (this._touchpadMiddleClickItem.state !== touchpadMiddleClick)
            this._touchpadMiddleClickItem.setToggleState(touchpadMiddleClick);
    }

    _isAutohideEnabled() {
        return this._settings.get_boolean('hide-topbar-fullscreen') ||
            this._settings.get_boolean('hide-topbar-fullscreen-all-monitors') ||
            this._settings.get_boolean('hide-topbar-maximized') ||
            this._settings.get_boolean('hide-topbar-touching');
    }

    _syncAutohideState() {
        const hideFullscreen = this._settings.get_boolean('hide-topbar-fullscreen');
        const hideFullscreenAllMonitors = this._settings.get_boolean('hide-topbar-fullscreen-all-monitors');
        const hideMaximized = this._settings.get_boolean('hide-topbar-maximized');
        const hideTouching = this._settings.get_boolean('hide-topbar-touching');
        const autohideEnabled = hideFullscreen || hideFullscreenAllMonitors || hideMaximized || hideTouching;

        this._fullscreenIcon.visible = autohideEnabled;
        this._stateIconsBox.visible = autohideEnabled || this._settings.get_boolean('keep-awake');
        this._hostnameStateSpacer.visible = this._stateIconsBox.visible;

        if (this._hideFullscreenItem.state !== hideFullscreen)
            this._hideFullscreenItem.setToggleState(hideFullscreen);

        if (this._hideFullscreenAllMonitorsItem.state !== hideFullscreenAllMonitors)
            this._hideFullscreenAllMonitorsItem.setToggleState(hideFullscreenAllMonitors);

        if (this._hideMaximizedItem.state !== hideMaximized)
            this._hideMaximizedItem.setToggleState(hideMaximized);

        if (this._hideTouchingItem.state !== hideTouching)
            this._hideTouchingItem.setToggleState(hideTouching);
    }

    destroy() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        if (this._desktopInterfaceChangedId) {
            this._desktopInterfaceSettings.disconnect(this._desktopInterfaceChangedId);
            this._desktopInterfaceChangedId = null;
        }

        if (this._touchpadSettingsChangedId) {
            this._touchpadSettings.disconnect(this._touchpadSettingsChangedId);
            this._touchpadSettingsChangedId = null;
        }

        if (this._keepAwakeToggledId) {
            this._keepAwakeItem.disconnect(this._keepAwakeToggledId);
            this._keepAwakeToggledId = null;
        }

        if (this._showTopBarToggledId) {
            this._showTopBarItem.disconnect(this._showTopBarToggledId);
            this._showTopBarToggledId = null;
        }

        if (this._showHostnameToggledId) {
            this._showHostnameItem.disconnect(this._showHostnameToggledId);
            this._showHostnameToggledId = null;
        }

        if (this._showUsernameToggledId) {
            this._showUsernameItem.disconnect(this._showUsernameToggledId);
            this._showUsernameToggledId = null;
        }

        if (this._showAvatarToggledId) {
            this._showAvatarItem.disconnect(this._showAvatarToggledId);
            this._showAvatarToggledId = null;
        }

        if (this._primaryPasteToggledId) {
            this._primaryPasteItem.disconnect(this._primaryPasteToggledId);
            this._primaryPasteToggledId = null;
        }

        if (this._touchpadMiddleClickToggledId) {
            this._touchpadMiddleClickItem.disconnect(this._touchpadMiddleClickToggledId);
            this._touchpadMiddleClickToggledId = null;
        }

        if (this._showQuickSettingsToggledId) {
            this._showQuickSettingsItem.disconnect(this._showQuickSettingsToggledId);
            this._showQuickSettingsToggledId = null;
        }

        if (this._quickSettingsToggleModeToggledId) {
            this._quickSettingsToggleModeItem.disconnect(this._quickSettingsToggleModeToggledId);
            this._quickSettingsToggleModeToggledId = null;
        }

        if (this._hideFullscreenToggledId) {
            this._hideFullscreenItem.disconnect(this._hideFullscreenToggledId);
            this._hideFullscreenToggledId = null;
        }

        if (this._hideFullscreenAllMonitorsToggledId) {
            this._hideFullscreenAllMonitorsItem.disconnect(this._hideFullscreenAllMonitorsToggledId);
            this._hideFullscreenAllMonitorsToggledId = null;
        }

        if (this._hideMaximizedToggledId) {
            this._hideMaximizedItem.disconnect(this._hideMaximizedToggledId);
            this._hideMaximizedToggledId = null;
        }

        if (this._hideTouchingToggledId) {
            this._hideTouchingItem.disconnect(this._hideTouchingToggledId);
            this._hideTouchingToggledId = null;
        }

        super.destroy();
    }
});

export default class UsernameAvatarExtension extends Extension {
    enable() {
        if (this._settings)
            return;

        this._settings = this.getSettings();
        this._mediaPlaying = false;
        this._resetKeepAwakeTimer();
        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (key === 'keep-awake' || key === 'keep-awake-fullscreen' ||
                key === 'keep-awake-media')
                this._syncInhibitor();

            if (key === 'keep-awake-timer-active' || key === 'keep-awake-timer-minutes') {
                this._resetKeepAwakeTimer();
                this._syncInhibitor();
            }

            if (key === 'place-after-navigation')
                this._rebuildButton();

            if (key === 'show-hostname' || key === 'show-username' || key === 'show-avatar' ||
                key === 'keep-awake' || key === 'show-topbar' || key === 'show-quick-settings' ||
                key === 'quick-settings-toggle-topbar-only' ||
                key === 'hide-topbar-fullscreen' || key === 'hide-topbar-fullscreen-all-monitors' ||
                key === 'hide-topbar-maximized' || key === 'hide-topbar-touching' ||
                LOAD_KEYS.includes(key) || TEMP_KEYS.includes(key) ||
                key === 'loads-position' || key === 'temps-position')
                this._refreshQuickSettingsMenu();

            if (key === 'show-topbar')
                this._rebuildButton();

            if (key === 'show-quick-settings') {
                this._removeQuickSettingsMenu();
                this._addQuickSettingsMenu();
            }

            if (key === 'hide-topbar-fullscreen' || key === 'hide-topbar-fullscreen-all-monitors' ||
                key === 'hide-topbar-maximized' || key === 'hide-topbar-touching')
                this._syncFullscreenPanelVisibility();
        });
        this._fullscreenChangedId = global.display.connect('in-fullscreen-changed', () => {
            this._syncFullscreenPanelVisibility();
            this._syncInhibitor();
        });
        this._focusWindowChangedId = global.display.connect('notify::focus-window', () => {
            this._trackFocusWindow();
            this._syncFullscreenPanelVisibility();
            this._syncInhibitor();
        });
        this._keepAwakeTimeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            KEEP_AWAKE_REFRESH_SECONDS,
            () => {
                this._refreshAutomaticKeepAwake();
                return GLib.SOURCE_CONTINUE;
            }
        );
        GLib.Source.set_name_by_id(this._keepAwakeTimeoutId, `[${this.constructor.name}] keep-awake refresh`);

        this._trackFocusWindow();
        this._rebuildButton();
        this._addMetricsButtons();
        this._addQuickSettingsMenu();
        this._refreshQuickSettingsMenu();
        this._syncInhibitor();
        this._syncFullscreenPanelVisibility();
    }

    disable() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        if (this._fullscreenChangedId) {
            global.display.disconnect(this._fullscreenChangedId);
            this._fullscreenChangedId = null;
        }

        if (this._focusWindowChangedId) {
            global.display.disconnect(this._focusWindowChangedId);
            this._focusWindowChangedId = null;
        }

        if (this._keepAwakeTimeoutId) {
            GLib.Source.remove(this._keepAwakeTimeoutId);
            this._keepAwakeTimeoutId = null;
        }

        this._disconnectFocusWindowSignals();

        this._releaseInhibitor();
        this._setPanelAutohide(false);
        this._removeMetricsButtons();
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
        this._button.setKeepAwakeEffective(this._shouldKeepAwake());
    }

    _addMetricsButtons() {
        this._removeMetricsButtons();

        this._leftMetrics = new SystemMetricsButton(this._settings, 'left');
        this._rightMetrics = new SystemMetricsButton(this._settings, 'right');
        Main.panel.addToStatusArea(`${this.uuid}-metrics-left`, this._leftMetrics, this._getPanelPosition() + 1, 'left');
        Main.panel.addToStatusArea(`${this.uuid}-metrics-right`, this._rightMetrics, 0, 'right');
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

    _refreshAutomaticKeepAwake() {
        if (!this._settings)
            return;

        this._mediaPlaying = this._settings.get_boolean('keep-awake-media') && isMediaPlaying();

        if (this._settings.get_boolean('keep-awake-timer-active') &&
            !this._isKeepAwakeTimerActive())
            this._settings.set_boolean('keep-awake-timer-active', false);

        this._syncInhibitor();
    }

    _resetKeepAwakeTimer() {
        if (!this._settings?.get_boolean('keep-awake-timer-active')) {
            this._keepAwakeTimerDeadline = null;
            return;
        }

        const duration = this._settings.get_uint('keep-awake-timer-minutes') * 60 * 1000000;
        this._keepAwakeTimerDeadline = GLib.get_monotonic_time() + duration;
    }

    _isKeepAwakeTimerActive() {
        return this._settings?.get_boolean('keep-awake-timer-active') &&
            this._keepAwakeTimerDeadline !== null &&
            GLib.get_monotonic_time() < this._keepAwakeTimerDeadline;
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

    _isFocusWindowFullscreen() {
        if (!this._focusWindow?.fullscreen)
            return false;

        if (this._settings?.get_boolean('hide-topbar-fullscreen-all-monitors'))
            return true;

        return this._isFocusWindowOnPrimaryMonitor();
    }

    _isFocusWindowMaximized() {
        return this._isFocusWindowOnPrimaryMonitor() &&
            (this._focusWindow?.is_maximized() ?? false);
    }

    _isFocusWindowTouchingTopBar() {
        if (!this._focusWindow || !this._isFocusWindowOnPrimaryMonitor())
            return false;

        const frameRect = this._focusWindow.get_frame_rect?.();
        if (!frameRect)
            return false;

        return frameRect.y <= Main.layoutManager.panelBox.height;
    }

    _isFocusWindowOnPrimaryMonitor() {
        if (!this._focusWindow)
            return false;

        return this._focusWindow.get_monitor?.() === global.display.get_primary_monitor();
    }

    _trackFocusWindow() {
        this._disconnectFocusWindowSignals();
        this._focusWindow = global.display.focus_window;

        if (!this._focusWindow)
            return;

        this._focusWindowSignalIds = [
            this._focusWindow.connect('notify::maximized-horizontally', () => {
                this._syncFullscreenPanelVisibility();
            }),
            this._focusWindow.connect('notify::maximized-vertically', () => {
                this._syncFullscreenPanelVisibility();
            }),
            this._focusWindow.connect('notify::fullscreen', () => {
                this._syncFullscreenPanelVisibility();
                this._syncInhibitor();
            }),
            this._focusWindow.connect('position-changed', () => {
                this._syncFullscreenPanelVisibility();
            }),
            this._focusWindow.connect('size-changed', () => {
                this._syncFullscreenPanelVisibility();
            }),
        ];
    }

    _disconnectFocusWindowSignals() {
        if (!this._focusWindow || !this._focusWindowSignalIds)
            return;

        for (const signalId of this._focusWindowSignalIds)
            this._focusWindow.disconnect(signalId);

        this._focusWindowSignalIds = null;
        this._focusWindow = null;
    }

    _syncFullscreenPanelVisibility() {
        const hideFullscreen = this._settings?.get_boolean('hide-topbar-fullscreen');
        const hideMaximized = this._settings?.get_boolean('hide-topbar-maximized');
        const hideTouching = this._settings?.get_boolean('hide-topbar-touching');
        const shouldHide =
            (hideFullscreen && this._isFocusWindowFullscreen()) ||
            (hideMaximized && this._isFocusWindowMaximized()) ||
            (hideTouching && this._isFocusWindowTouchingTopBar());

        this._setPanelAutohide(shouldHide);
    }

    _setPanelAutohide(hidden) {
        const panelBox = Main.layoutManager.panelBox;

        if (!panelBox)
            return;

        if (hidden) {
            if (!this._panelUntracked) {
                Main.layoutManager.untrackChrome(panelBox);
                this._panelUntracked = true;
            }

            panelBox.visible = false;
        } else {
            panelBox.visible = true;

            if (this._panelUntracked) {
                Main.layoutManager.trackChrome(panelBox, {affectsStruts: true});
                this._panelUntracked = false;
            }
        }

        Main.layoutManager._queueUpdateRegions?.();
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
