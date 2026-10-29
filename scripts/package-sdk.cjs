'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'sdk', name), 'utf8'));
const pkg = read('package.json');
const surface = read('api-surface.json');
const report = read('generation-report.json');
if (surface.sdkVersion !== pkg.version || surface.game.build !== report.build ||
    surface.game.exeSha256 !== report.exeSha256 ||
    JSON.stringify(surface.coverage) !== JSON.stringify(report.counts)) {
    throw new Error('SDK metadata is stale; update api-surface.json and the version before packaging');
}
const destination = path.join(root, 'build/sdk');
fs.mkdirSync(destination, { recursive: true });
if (!process.env.npm_execpath) throw new Error('Run with npm run sdk:pack');
const result = spawnSync(process.execPath, [process.env.npm_execpath, 'pack', './sdk', '--pack-destination', destination], {
    cwd: root, stdio: 'inherit'
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
