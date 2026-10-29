'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Only remove this template's fixed output directory, regardless of shell cwd.
const root = fs.realpathSync(path.resolve(__dirname, '..'));
const output = path.join(root, 'dist');
if (fs.existsSync(output)) {
    if (fs.lstatSync(output).isSymbolicLink() || fs.realpathSync(output) !== output) {
        throw new Error('Refusing to clean a redirected dist directory');
    }
    fs.rmSync(output, { recursive: true });
}
