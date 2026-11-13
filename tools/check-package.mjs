import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

export function manifestFiles(text) {
    return text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
}

export function checkEntries(entries, expected) {
    if (entries.some(name => name.startsWith('/') || name.split('/').includes('..')))
        throw new Error('Unsafe archive path');
    if (new Set(entries).size !== entries.length)
        throw new Error('Duplicate archive entry');
    const actual = new Set(entries);
    const allowed = new Set(expected);
    const missing = expected.filter(name => !actual.has(name));
    const extra = entries.filter(name => !allowed.has(name));
    if (missing.length || extra.length)
        throw new Error(`Package manifest mismatch; missing: ${missing.join(', ')}; unexpected: ${extra.join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [archive, variant] = process.argv.slice(2);
    if (!archive || !['public', 'su'].includes(variant))
        throw new Error('Usage: node tools/check-package.mjs ARCHIVE public|su');
    const read = name => manifestFiles(fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
    const expected = read('package-files.txt');
    if (variant === 'su')
        expected.push(...read('package-files-su.txt'));
    const entries = execFileSync('unzip', ['-Z1', archive], {encoding: 'utf8'}).trim().split('\n');
    checkEntries(entries, expected);
    console.log(`${variant} package matches its exact manifest`);
}
