'use strict';
// CommonJS, deliberately independent of Node APIs: runs in the game's PuerTS VM.
exports.load = function load(config, importMod, log) {
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
    const result = [];
    for (const mod of config.mods) {
        if (!mod.enabled) {
            result.push({ id: mod.id, status: 'disabled' });
            log('disabled ' + mod.id);
            continue;
        }
        try {
            const instance = importMod('./' + mod.entry);
            result.push({ id: mod.id, status: 'loaded', instance });
            log('loaded ' + mod.id);
        } catch (error) {
            result.push({ id: mod.id, status: 'failed' });
            log('failed ' + mod.id + ': ' + String(error && error.stack || error));
        }
    }
    return result;
};
