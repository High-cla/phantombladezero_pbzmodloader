'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const base = path.resolve(__dirname, '../src');
const manager = require(path.join(base, 'script-manager.js'));
const { compose, limit } = require('../scripts/embed-script.cjs');
const { load, reload, watch, createNotifier, aliasRoot, createImporter } = manager;
const mod = (id, enabled = true, entry = 'mods/' + id + '/main.js') => ({ id, enabled, entry });
test('ordered loading, disabled entries, failure isolation', () => {
    const calls = [], logs = [];
    const result = load({ version: 1, mods: [mod('a'), mod('off', false), mod('bad'), mod('b')] }, entry => {
        calls.push(entry); if (entry.includes('/bad/')) throw new Error('intentional'); return { entry };
    }, line => logs.push(line));
    assert.deepEqual(calls, ['mods/a/main.js', 'mods/bad/main.js', 'mods/b/main.js']);
    assert.deepEqual(result.map(m => m.status), ['loaded', 'disabled', 'failed', 'loaded']);
    assert.match(logs[2], /intentional/);
});
test('a TypeScript-only MOD is reported, not silently skipped', () => {
    const logs = [];
    const result = load({ version: 1, mods: [{ ...mod('ts', false), note: 'TypeScript source without main.js' }] }, () => assert.fail('must not run'), line => logs.push(line));
    assert.equal(result[0].status, 'disabled');
    assert.match(logs[0], /disabled ts: TypeScript source without main\.js/);
});
test('invalid config rejected before any MOD executes', () => {
    for (const mods of [[mod('a'), mod('a')], [mod('a', true, '../escape.js')], [mod('a', true, 'mods/a.ts')], [mod('a', 'true')]]) {
        let calls = 0;
        assert.throws(() => load({version: 1, mods}, () => { calls++; }, () => {}));
        assert.equal(calls, 0);
    }
});
const root = 'T:/Game/ProjectPBZ/PBZModLoader';
function bootstrapContext({ mail, onImport = () => ({ stop() {} }) } = {}) {
    const started = [], imported = [], timers = [], logs = [];
    const message = { value: mail || { revision: 0, config: { version: 1, root, mods: [mod('a'), mod('off', false)] } } };
    const puerts = {
        __require(name) { started.push(name); return {}; },
        loadModule(file) { assert.equal(file, 'slot-script-path'); return JSON.stringify(message.value); },
        genRequire: dir => name => { imported.push([dir, name]); return onImport(dir, name); }
    };
    const context = vm.createContext({
        console: { log: line => logs.push(line), error: line => logs.push(line) },
        setInterval(callback) { timers.push(callback); return 1; },
        setTimeout() { return 1; }, clearTimeout() {}
    });
    const require = name => { if (name === 'puerts') return puerts; if (name === './manager') return manager; throw new Error('unexpected ' + name); };
    return { context, require, started, imported, timers, logs, message };
}
// The same wrapper the game's module system puts around a script.
const execute = (source, run) => vm.runInContext('(function (exports, require, module, __filename, __dirname) { ' + source + '\n});', run.context)({}, run.require, {}, 'slot-script-path', '');
test('bootstrap runs the original start first, then loads MODs from their folder, once', () => {
    const source = fs.readFileSync(path.join(base, 'script-bootstrap.js'), 'utf8');
    const run = bootstrapContext();
    execute(source, run); execute(source, run);
    assert.deepEqual(run.started, ['MainStart', 'MainStart']);
    assert.deepEqual(run.imported, [[root + '/mods/a', './main.js']]);
    assert.equal(run.context.__PBZModLoader.status, 'ready');
    assert.ok(run.logs.includes('[PBZMOD] ready loaded=1 failed=0'));
});
test('bootstrap keeps the original start error and reports a configuration error without running MODs', () => {
    const source = fs.readFileSync(path.join(base, 'script-bootstrap.js'), 'utf8');
    const error = new Error('original startup');
    const failing = bootstrapContext();
    failing.require = () => ({ __require() { throw error; } });
    assert.throws(() => execute(source, failing), value => value === error);
    assert.ok(failing.logs.some(line => line.includes('original MainStart failed')));
    const bad = bootstrapContext({ mail: { revision: 0, error: 'Unsupported config version' } });
    execute(source, bad);
    assert.equal(bad.context.__PBZModLoader.status, 'failed');
    assert.equal(bad.imported.length, 0);
    assert.ok(bad.logs.some(line => line.includes('Unsupported config version')));
});
test('the embedded script is one file that fits the smallest script slot, with the manager inside', () => {
    const script = compose();
    assert.ok(Buffer.byteLength(script) <= limit, Buffer.byteLength(script) + ' bytes');
    assert.ok(!script.includes("require('./manager')"));
    const run = bootstrapContext();
    execute(script, run);
    assert.deepEqual(run.started, ['MainStart']);
    assert.deepEqual(run.imported, [[root + '/mods/a', './main.js']]);
    assert.equal(run.context.__PBZModLoader.status, 'ready');
    assert.equal(run.timers.length, 1);
});
test('each reload revision has its own spelling of the root and the same real folder', () => {
    assert.equal(aliasRoot(root, 0), root);
    const seen = new Set();
    for (let revision = 0; revision < 4096; revision++) {
        const alias = aliasRoot(root, revision);
        assert.equal(alias.toLowerCase(), root.toLowerCase());
        assert.equal(alias.slice(0, alias.lastIndexOf('/')), 'T:/Game/ProjectPBZ');
        seen.add(alias);
    }
    assert.equal(seen.size, 4096);
    assert.throws(() => aliasRoot(root, 4096), /restart the game/);
    const calls = [];
    createImporter(dir => name => { calls.push([dir, name]); }, root, 1)('mods/a/sub/main.js');
    assert.deepEqual(calls, [[aliasRoot(root, 1) + '/mods/a/sub', './main.js']]);
});

test('reload awaits cleanup before executing any new MOD and isolates cleanup failures', async () => {
    const calls = [];
    const old = [
        { id: 'a', status: 'loaded', instance: { async stop() { await Promise.resolve(); calls.push('stop a'); } } },
        { id: 'b', status: 'loaded', instance: { stop() { throw Error('cleanup'); } } },
        { id: 'removed', status: 'loaded', instance: { stop() { calls.push('stop removed'); } } }
    ];
    const result = await reload(old, { version: 1, mods: [mod('a'), mod('b')] }, entry => {
        calls.push(entry); return {};
    }, () => {});
    assert.deepEqual(calls, ['stop a', 'stop removed', 'mods/a/main.js']);
    assert.equal(result[1], old[1]);
});

test('missing stop and failed evaluation cannot duplicate registrations; disabled MODs can load', async () => {
    const old = [{ id: 'a', status: 'loaded', instance: {} }, { id: 'bad', status: 'failed' }, { id: 'off', status: 'disabled' }];
    const calls = [];
    const result = await reload(old, { version: 1, mods: [mod('a'), mod('bad'), mod('off')] }, entry => { calls.push(entry); return {}; }, () => {});
    assert.deepEqual(calls, ['mods/off/main.js']);
    assert.equal(result[0], old[0]);
    assert.equal(result[1], old[1]);
    await assert.rejects(reload(old, { version: 2, mods: [] }, () => {}, () => {}));
});

test('watch serializes slow stops, ignores unchanged revisions and imports under the new revision', async () => {
    let tick, release, mail = { revision: 0, config: { version: 1, mods: [mod('a')] } }, starts = 0, active = 1;
    const revisions = [];
    const state = { mods: [{ id: 'a', status: 'loaded', instance: { stop: () => new Promise(resolve => { release = () => { active--; resolve(); }; }) } }] };
    watch(state, () => mail, revision => { revisions.push(revision); return entry => {
        assert.equal(entry, 'mods/a/main.js');
        assert.equal(active, 0); active++; starts++;
        return { stop() { active--; } };
    }; }, () => {}, (callback, delay) => { tick = callback; assert.equal(delay, 1000); });
    await tick(); assert.equal(starts, 0);
    mail = { revision: 1, config: mail.config };
    const pending = tick(); await tick(); assert.equal(starts, 0);
    release(); await pending; await tick();
    assert.equal(starts, 1); assert.equal(active, 1);
    assert.deepEqual(revisions, [1]);
});

test('reload results distinguish blocked cleanup and preparation errors on screen', async () => {
    let tick, mail = { revision: 1, config: { version: 1, mods: [mod('a')] } };
    const notices = [];
    const state = { mods: [{ id: 'a', status: 'loaded', instance: {} }] };
    watch(state, () => mail, () => () => ({}), () => {}, callback => { tick = callback; }, (message, failed) => notices.push({ message, failed }));
    await tick();
    assert.match(notices[0].message, /^MOD reload done: 0 OK, 1 failed or skipped - MOD 重载完成：成功 0，失败或跳过 1$/);
    assert.equal(notices[0].failed, true);
    const instance = state.mods[0];
    mail = { revision: 2, error: 'preparation failed' };
    await tick();
    assert.match(notices[1].message, /^MOD reload failed, see loader\.log - MOD 重载失败，请查看 loader\.log$/);
    assert.equal(state.mods[0], instance);
    await tick();
    assert.equal(notices.length, 2);
});

test('notification replaces the previous overlay, expires, and tolerates missing UI', () => {
    const widgets = new Set(), timers = new Map(), logs = [];
    let serial = 0;
    const viewport = {
        AddWidget(widget, slot) { assert.equal(slot.ZOrder, 1000000); assert.equal(slot.Offsets.Left, 24); widgets.add(widget); return true; },
        RemoveWidget(widget) { widgets.delete(widget); }
    };
    class Struct {}
    const UE = {
        SubsystemBlueprintLibrary: { GetEngineSubsystem: () => viewport },
        GameViewportSubsystem: { StaticClass() {} },
        ESlateVisibility: { HitTestInvisible: 4 },
        KismetTextLibrary: { Conv_StringToText: text => ({ text }) },
        TextBlock: class {
            SetText(value) { assert.equal(typeof value, 'object'); this.text = value.text; }
            SetVisibility(value) { assert.equal(value, 4); }
            SetColorAndOpacity(color) { assert.equal(color.SpecifiedColor.A, 1); }
            SetShadowColorAndOpacity() {} SetShadowOffset() {}
        },
        SlateColor: Struct, LinearColor: Struct, Vector2D: Struct, Margin: Struct, GameViewportWidgetSlot: Struct
    };
    const notify = createNotifier(name => name === 'ue' ? UE : { argv: { getByName: () => ({}) } },
        message => logs.push(message), (callback, ms) => { assert.equal(ms, 4000); timers.set(++serial, callback); return serial; }, id => timers.delete(id));
    notify('success', false); notify('partial failure', true);
    assert.equal(widgets.size, 1); assert.equal(timers.size, 1);
    assert.match([...widgets][0].text, /partial failure/);
    [...timers.values()][0](); assert.equal(widgets.size, 0);
    UE.SubsystemBlueprintLibrary.GetEngineSubsystem = () => null;
    assert.doesNotThrow(() => notify('unavailable', true));
    assert.match(logs[0], /notification unavailable/);
});
