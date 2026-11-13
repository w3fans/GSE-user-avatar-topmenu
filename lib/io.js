import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const pendingCommands = new Set();
let commandCancellable = null;
export function setCommandCancellable(cancellable) {
    commandCancellable = cancellable;
}

export function runCommandAsync(argv, options = {}) {
    const timeoutMs = options.timeoutMs ?? 3000;
    const cancellable = options.cancellable ?? commandCancellable;

    return new Promise(resolve => {
        let process;
        try {
            process = Gio.Subprocess.new(
                argv,
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
            );
        } catch (_error) {
            resolve('');
            return;
        }

        const command = {process, timeoutId: null};
        pendingCommands.add(command);
        command.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeoutMs, () => {
            command.timeoutId = null;
            process.force_exit();
            return GLib.SOURCE_REMOVE;
        });

        process.communicate_utf8_async(null, cancellable, (source, result) => {
            if (command.timeoutId) {
                GLib.Source.remove(command.timeoutId);
                command.timeoutId = null;
            }
            pendingCommands.delete(command);

            try {
                const [, stdout] = source.communicate_utf8_finish(result);
                resolve(source.get_successful() ? stdout.trim() : '');
            } catch (_error) {
                resolve('');
            }
        });
    });
}

export function cancelPendingCommands() {
    for (const command of pendingCommands) {
        if (command.timeoutId) {
            GLib.Source.remove(command.timeoutId);
            command.timeoutId = null;
        }
        command.process.force_exit();
    }
    pendingCommands.clear();
}

export function dbusCallAsync(connection, busName, objectPath, interfaceName,
    methodName, parameters, replyType, timeoutMs = 3000, cancellable = null) {
    return new Promise((resolve, reject) => {
        connection.call(
            busName,
            objectPath,
            interfaceName,
            methodName,
            parameters,
            replyType,
            Gio.DBusCallFlags.NONE,
            timeoutMs,
            cancellable,
            (source, result) => {
                try {
                    resolve(source.call_finish(result));
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
}
