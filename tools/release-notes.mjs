import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tag = process.argv[2];
if (!/^v\d+\.\d+\.\d+(su)?$/.test(tag ?? ''))
    throw new Error('Expected a version tag, e.g. v0.8.9 or v0.8.9su');
const personal = tag.endsWith('su');
const version = tag.slice(1).replace(/su$/, '');
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const section = changelog.split(/^## /m).find(entry => entry.split('\n')[0].trim() === version);
if (!section)
    throw new Error(`Missing CHANGELOG entry for ${version}`);
const changes = section.slice(section.indexOf('\n')).trim();
console.log(`# ${tag}\n\n## Changes\n\n${changes}\n`);
if (personal) {
    console.log('## Personal SU companion\n');
    console.log('This is a publicly downloadable, unsupported personal build. It includes privileged RAM inventory and exact-model Gigabyte G5 GD / G6 KF hardware controls. It is not an EGO submission. Hardware controls require separately installed drivers, helpers, and narrowly scoped sudo permissions.\n');
    console.log('Keyboard fade requires permission for intermediate brightness values 0–255; see HARDWARE-SETUP.md inside the SU ZIP. Install the ZIP, then log out/in to load the updated modules.\n');
} else {
    console.log('## Public extension\n');
    console.log('Install the public .shell-extension.zip asset. SU-only changes listed above are excluded from this package; it contains no privileged hardware helper calls. Log out/in after updating.\n');
}
console.log('Compatibility: GNOME Shell 45–51 is declared. GNOME 51 has local runtime coverage; a complete physical 45–50 matrix is still pending.');
