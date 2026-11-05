'use strict';
// CommonJS, deliberately independent of Node APIs: runs in the game's PuerTS VM.
function validate(config) {
    if (!config || config.version !== 1 || !Array.isArray(config.mods)) {
        throw new Error('Unsupported MOD configuration');
    }
    const ids = new Set();
    for (const mod of config.mods) {
        if (!mod || !/^[A-Za-z0-9_-]+$/.test(mod.id) || ids.has(mod.id) ||
            typeof mod.enabled !== 'boolean' || typeof mod.entry !== 'string' ||
            !/^mods\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.js$/.test(mod.entry)) {
            throw new Error('Invalid or duplicate MOD: ' + (mod && mod.id));
        }
        ids.add(mod.id);
    }
}
// The game's module cache keys on the full path and cannot forget one. Windows paths ignore
// case, so each reload revision spells the root's last folder differently: a new identity
// for a MOD's whole module tree, with nothing copied. Modules of an older revision keep
// their spelling, so their delayed require() calls still resolve, against the files as they
// are now. Modules outside the root (the game's own) keep one identity.
exports.aliasRoot = function aliasRoot(root, revision) {
    const at = root.lastIndexOf('/') + 1;
    const letters = [...root.slice(at)];
    const positions = letters.map((c, i) => (/[A-Za-z]/.test(c) ? i : -1)).filter(i => i >= 0);
    if (revision < 0 || revision >= 2 ** positions.length) throw new Error('Too many reloads; restart the game');
    positions.forEach((position, bit) => {
        if (Math.floor(revision / 2 ** bit) % 2) {
            const c = letters[position];
            letters[position] = c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase();
        }
    });
    return root.slice(0, at) + letters.join('');
};
exports.createImporter = function createImporter(genRequire, root, revision) {
    const alias = exports.aliasRoot(root, revision);
    return entry => {
        const slash = entry.lastIndexOf('/');
        return genRequire(alias + '/' + entry.slice(0, slash))('./' + entry.slice(slash + 1));
    };
};
exports.load = function load(config, importMod, log) {
    validate(config);
    const result = [];
    for (const mod of config.mods) {
        if (!mod.enabled) {
            result.push({ id: mod.id, status: 'disabled' });
            log('disabled ' + mod.id + (mod.note ? ': ' + mod.note : ''));
            continue;
        }
        try {
            const instance = importMod(mod.entry);
            result.push({ id: mod.id, status: 'loaded', instance });
            log('loaded ' + mod.id);
        } catch (error) {
            result.push({ id: mod.id, status: 'failed' });
            log('failed ' + mod.id + ': ' + String(error && error.stack || error));
        }
    }
    return result;
};

// A failed import may already have registered callbacks. Do not retry it in this
// session: there is no exported instance with which to clean up those effects.
exports.reload = async function reload(previous, config, importMod, log) {
    validate(config);
    const blocked = new Map();
    for (const mod of previous) {
        if (mod.status === 'disabled' || mod.status === 'stopped') continue;
        if (mod.status === 'failed') { blocked.set(mod.id, mod); continue; }
        try {
            if (!mod.instance || typeof mod.instance.stop !== 'function') {
                throw new Error('export stop() to enable hot reload');
            }
            await mod.instance.stop();
            delete mod.reloadError;
            mod.status = 'stopped';
            log('stopped ' + mod.id);
        } catch (error) {
            mod.reloadError = true;
            blocked.set(mod.id, mod);
            log('reload blocked ' + mod.id + ': ' + String(error && error.stack || error));
        }
    }
    const next = [];
    for (const mod of config.mods) {
        if (blocked.has(mod.id)) {
            next.push(blocked.get(mod.id));
            blocked.delete(mod.id);
        } else {
            next.push(...exports.load({ version: 1, mods: [mod] }, importMod, log));
        }
    }
    // Keep failed cleanup instances reachable even if removed from configuration.
    return next.concat(Array.from(blocked.values()));
};

exports.watch = function watch(state, readMail, importerFor, log, schedule = setInterval, notify = () => {}) {
    let revision = 0, busy = false;
    return schedule(async () => {
        if (busy) return;
        busy = true;
        try {
            const mail = readMail();
            // The DLL's revision only moves on Alt+F5. No change is the normal idle state.
            if (mail.revision === revision) return;
            revision = mail.revision;
            if (mail.error) throw new Error(mail.error);
            state.mods = await exports.reload(state.mods, mail.config, importerFor(revision), log);
            log('reload complete revision=' + revision);
            const failed = state.mods.filter(mod => mod.status === 'failed' || mod.reloadError).length;
            const loaded = state.mods.filter(mod => mod.status === 'loaded' && !mod.reloadError).length;
            notify(failed
                ? 'MOD reload done: ' + loaded + ' OK, ' + failed + ' failed or skipped - MOD 重载完成：成功 ' + loaded + '，失败或跳过 ' + failed
                : 'MODs reloaded (' + loaded + ') - MOD 重载成功（' + loaded + ' 个）', failed > 0);
        } catch (error) {
            log('reload failed: ' + String(error && error.stack || error));
            notify('MOD reload failed, see loader.log - MOD 重载失败，请查看 loader.log', true);
        } finally { busy = false; }
    }, 1000);
};

// Use a real UMG overlay: debug PrintString may be compiled out in Shipping.
exports.createNotifier = function createNotifier(importMod, log, delay = setTimeout, cancel = clearTimeout) {
    let widget, viewport, timer;
    return (message, failed) => {
        try {
            const UE = importMod('ue');
            const gi = importMod('puerts').argv.getByName('GameInstance');
            if (timer !== undefined) { cancel(timer); timer = undefined; }
            if (widget && viewport) { viewport.RemoveWidget(widget); widget = undefined; }
            viewport = UE.SubsystemBlueprintLibrary.GetEngineSubsystem(UE.GameViewportSubsystem.StaticClass());
            if (!viewport || !gi) throw new Error('viewport unavailable');
            widget = new UE.TextBlock(gi);
            widget.SetText(UE.KismetTextLibrary.Conv_StringToText('[PBZModLoader] ' + message));
            widget.SetVisibility(UE.ESlateVisibility.HitTestInvisible);
            const color = new UE.SlateColor();
            const tint = new UE.LinearColor();
            tint.R = failed ? 1 : 0.3; tint.G = failed ? 0.65 : 1; tint.B = 0.3; tint.A = 1;
            color.SpecifiedColor = tint;
            widget.SetColorAndOpacity(color);
            const shadow = new UE.LinearColor(); shadow.A = 1;
            widget.SetShadowColorAndOpacity(shadow);
            const shadowOffset = new UE.Vector2D(); shadowOffset.X = 1; shadowOffset.Y = 1;
            widget.SetShadowOffset(shadowOffset);
            const slot = new UE.GameViewportWidgetSlot();
            // Reflected structs do not all implement positional constructors.
            const offsets = new UE.Margin();
            offsets.Left = 24; offsets.Top = 24; offsets.Right = 1600; offsets.Bottom = 50;
            slot.Offsets = offsets;
            slot.ZOrder = 1000000;
            slot.bAutoRemoveOnWorldRemoved = true;
            if (!viewport.AddWidget(widget, slot)) throw new Error('AddWidget failed');
            timer = delay(() => {
                timer = undefined;
                try { if (widget) viewport.RemoveWidget(widget); }
                catch (error) { log('notification cleanup failed: ' + String(error)); }
                widget = undefined;
            }, 4000);
        } catch (error) {
            log('notification unavailable: ' + String(error));
        }
    };
};
