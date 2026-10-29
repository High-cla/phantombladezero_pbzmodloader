'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const base = path.resolve(__dirname, '../runtime/ProjectPBZ/Content/JavaScript/PBZModLoader');
const { load } = require(path.join(base, 'manager.js'));
const mod = (id, enabled = true, entry = 'mods/' + id + '/main.js') => ({ id, enabled, entry });
test('ordered loading, disabled entries, failure isolation', () => {
    const calls = [], logs = [];
    const result = load({ version: 1, mods: [mod('a'), mod('off', false), mod('bad'), mod('b')] }, entry => {
        calls.push(entry); if (entry.includes('/bad/')) throw new Error('intentional'); return { entry };
    }, line => logs.push(line));
    assert.deepEqual(calls, ['./generated-mods/a/main.js', './generated-mods/bad/main.js', './generated-mods/b/main.js']);
    assert.deepEqual(result.map(m => m.status), ['loaded', 'disabled', 'failed', 'loaded']);
    assert.match(logs[2], /intentional/);
});
test('invalid config rejected before any MOD executes', () => {
    for (const mods of [[mod('a'), mod('a')], [mod('a', true, '../escape.js')], [mod('a', true, 'mods/a.ts')], [mod('a', 'true')]]) {
        let calls = 0;
        assert.throws(() => load({version: 1, mods}, () => { calls++; }, () => {}));
        assert.equal(calls, 0);
    }
});
test('bootstrap preserves original startup errors and loads only once', () => {
    const source = fs.readFileSync(path.join(base, 'bootstrap.js'), 'utf8');
    let original = 0, mods = 0;
    const context = vm.createContext({console: {log() {}, error() {}}, require(name) {
        if (name === 'MainStart') { original++; return {}; }
        if (name === './manager') return {load() { mods++; return []; }};
        return {version: 1, mods: []};
    }});
    vm.runInContext(source, context); vm.runInContext(source, context);
    assert.equal(original, 2); assert.equal(mods, 1); assert.equal(context.__PBZModLoader.status, 'ready');
    const error = new Error('original startup');
    assert.throws(() => vm.runInNewContext(source, {require() {throw error;}}), value => value === error);
});
