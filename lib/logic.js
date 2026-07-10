export function clampPercent(value) {
    if (value === null || !Number.isFinite(value))
        return null;

    return Math.max(0, Math.min(100, Math.round(value)));
}

export function calculateCpuUsage(previous, current) {
    if (!previous || !current)
        return null;

    const totalDelta = current.total - previous.total;
    const idleDelta = current.idle - previous.idle;
    if (totalDelta <= 0 || idleDelta < 0)
        return null;

    return clampPercent((1 - idleDelta / totalDelta) * 100);
}

export function calculateEngineUsage(previous, current, busyUnit = 'nanoseconds') {
    if (!previous || !current)
        return null;

    const busyDelta = current.busy - previous.busy;
    const elapsedMicroseconds = current.time - previous.time;
    if (busyDelta < 0 || elapsedMicroseconds <= 0)
        return null;

    const busyMicroseconds = busyUnit === 'nanoseconds' ? busyDelta / 1000 : busyDelta;
    return clampPercent(busyMicroseconds / elapsedMicroseconds * 100);
}

export function calculateMemoryUsage(total, available) {
    if (!Number.isFinite(total) || total <= 0)
        return {used: 0, percent: null};

    const used = Math.max(total - Math.max(available ?? 0, 0), 0);
    return {used, percent: clampPercent(used / total * 100)};
}

export function formatBinaryBytes(bytes, decimals = 1) {
    if (bytes === null || !Number.isFinite(bytes) || bytes < 0)
        return '--';

    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index++;
    }

    const digits = index === 0 ? 0 : decimals;
    return `${value.toFixed(digits).replace(/\.0$/, '')} ${units[index]}`;
}

export function formatTemperature(temp, unit, decimals) {
    if (temp === null || !Number.isFinite(temp))
        return unit === 'fahrenheit' ? '--°F' : '--°C';

    const value = unit === 'fahrenheit' ? temp * 9 / 5 + 32 : temp;
    return `${value.toFixed(decimals ? 1 : 0)}°${unit === 'fahrenheit' ? 'F' : 'C'}`;
}

export function getTemperatureColor(temp, warning = 60, critical = 75) {
    if (temp === null || !Number.isFinite(temp))
        return '#9a9996';
    if (temp < Math.max(0, warning - 20))
        return '#57e389';
    if (temp < warning)
        return '#f8e45c';
    if (temp < critical)
        return '#ff7800';
    return '#e01b24';
}

export function shouldHidePanel(options, windowState, primaryMonitor) {
    if (!windowState)
        return false;

    const onPrimary = windowState.monitor === primaryMonitor.index;
    const fullscreen = options.fullscreen && windowState.fullscreen &&
        (options.fullscreenAllMonitors || onPrimary);
    const maximized = options.maximized && onPrimary && windowState.maximized;
    const panelBottom = primaryMonitor.y + primaryMonitor.panelHeight;
    const touching = options.touching && onPrimary && windowState.y <= panelBottom;
    return fullscreen || maximized || touching;
}

export function timerIsActive(active, deadlineUsec, nowUsec) {
    return Boolean(active && deadlineUsec > 0 && nowUsec < deadlineUsec);
}

export function timerRemainingSeconds(deadlineUsec, nowUsec) {
    return Math.max(0, Math.ceil((deadlineUsec - nowUsec) / 1_000_000));
}

export function parseProcNetDev(contents, ignored = ['lo']) {
    const totals = {rx: 0, tx: 0};
    if (!contents)
        return totals;

    for (const line of contents.split('\n').slice(2)) {
        const match = line.match(/^\s*([^:]+):\s*(.+)$/);
        if (!match || ignored.includes(match[1].trim()))
            continue;
        const fields = match[2].trim().split(/\s+/).map(Number);
        totals.rx += Number.isFinite(fields[0]) ? fields[0] : 0;
        totals.tx += Number.isFinite(fields[8]) ? fields[8] : 0;
    }
    return totals;
}

export function parseProcDiskstats(contents) {
    const totals = {readBytes: 0, writeBytes: 0};
    if (!contents)
        return totals;

    for (const line of contents.split('\n')) {
        const fields = line.trim().split(/\s+/);
        if (fields.length < 14)
            continue;
        const name = fields[2];
        if (/^(loop|ram|fd|sr|dm-)/.test(name) ||
            /^(sd|vd|xvd)[a-z]+\d+$/.test(name) || /p\d+$/.test(name))
            continue;
        totals.readBytes += Number(fields[5] ?? 0) * 512;
        totals.writeBytes += Number(fields[9] ?? 0) * 512;
    }
    return totals;
}

export function parseDmiMemory(contents) {
    const modules = [];
    for (const block of (contents ?? '').split(/\n\s*\n/)) {
        const size = block.match(/^\s*Size:\s*(.+)$/m)?.[1]?.trim();
        if (!size || size === 'No Module Installed')
            continue;
        modules.push({
            type: block.match(/^\s*Type:\s*(.+)$/m)?.[1] ?? '',
            size,
            locator: block.match(/^\s*Locator:\s*(.+)$/m)?.[1] ?? '',
            speed: block.match(/^\s*Configured Memory Speed:\s*(.+)$/m)?.[1] ??
                block.match(/^\s*Speed:\s*(.+)$/m)?.[1] ?? '',
            part: block.match(/^\s*Part Number:\s*(.+)$/m)?.[1]?.trim() ?? '',
        });
    }
    return modules;
}
