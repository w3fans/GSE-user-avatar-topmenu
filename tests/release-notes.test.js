import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

const script = new URL('../tools/release-notes.mjs', import.meta.url);
const changelog = fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const version = changelog.match(/^## (\d+\.\d+\.\d+)$/m)[1];
test('release descriptions distinguish public and SU distributions and work outside the repo', () => {
    const notes = tag => execFileSync(process.execPath, [script.pathname, tag], {cwd: '/tmp', encoding: 'utf8'});
    const publicNotes = notes(`v${version}`);
    const suNotes = notes(`v${version}su`);
    assert.match(publicNotes, /## Changes/);
    assert.match(publicNotes, /Public extension/);
    assert.match(suNotes, /publicly downloadable, unsupported personal build/);
    assert.match(suNotes, /HARDWARE-SETUP.md/);
    assert(publicNotes.includes(changelog.split(`## ${version}\n`)[1].split('\n## ')[0].trim()));
    assert.notEqual(spawnSync(process.execPath, [script.pathname, 'main']).status, 0);
});
