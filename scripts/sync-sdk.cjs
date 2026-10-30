'use strict';
// Keep the copied template self-contained. The SDK source of truth is sdk/.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'sdk');
const target = path.join(root, 'templates/ts-mod/vendor/game-api');
const files = ['package.json', 'index.d.ts', 'types', 'api-surface.json', 'generation-report.json', 'type-index.json', 'property-mapping-verification.json', 'binding-support-verification.json', 'README.md'];
for (const file of files) fs.accessSync(path.join(source, file));
// Rebuild only this generated directory; do not follow redirected destinations.
if (fs.existsSync(target)) {
    const vendor = fs.realpathSync(path.dirname(target));
    const resolved = fs.realpathSync(target);
    if (fs.lstatSync(target).isSymbolicLink() || resolved !== path.join(vendor, 'game-api') ||
        !vendor.startsWith(fs.realpathSync(root) + path.sep)) {
        throw new Error('Refusing to replace a redirected SDK directory: ' + target);
    }
    fs.rmSync(resolved, { recursive: true });
}
fs.mkdirSync(target, { recursive: true });
for (const file of files) fs.cpSync(path.join(source, file), path.join(target, file), { recursive: true });
console.log('Synced sdk/ to templates/ts-mod/vendor/game-api/');
