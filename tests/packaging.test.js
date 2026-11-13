import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {checkEntries, manifestFiles} from '../tools/check-package.mjs';

test('public and SU manifests exclude backups, unexpected files and unsafe paths', () => {
    const read = name => manifestFiles(fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
    const publicFiles = read('package-files.txt');
    const personalFiles = read('package-files-su.txt');
    const suFiles = [...publicFiles, ...personalFiles];
    assert(personalFiles.length > 0);
    assert(personalFiles.every(name => !publicFiles.includes(name)));
    assert(suFiles.every(name => !/\.(orig|rej)$/.test(name)));
    checkEntries(publicFiles, publicFiles);
    checkEntries(suFiles, suFiles);
    for (const bad of ['extension.js.orig', 'prefs.js.orig', 'prefs.js.rej', '../secret', '/secret'])
        assert.throws(() => checkEntries([...suFiles, bad], suFiles));
    assert.throws(() => checkEntries(suFiles, publicFiles));
    assert.throws(() => checkEntries(publicFiles, suFiles));
    assert.throws(() => checkEntries([...publicFiles, publicFiles[0]], publicFiles));
});
