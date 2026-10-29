'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'build/sdk');
fs.mkdirSync(destination, { recursive: true });
if (!process.env.npm_execpath) throw new Error('Run with npm run sdk:pack');
const result = spawnSync(process.execPath, [process.env.npm_execpath, 'pack', './sdk', '--pack-destination', destination], {
    cwd: root, stdio: 'inherit'
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
