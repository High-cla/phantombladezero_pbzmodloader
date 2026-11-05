'use strict';
// Built into the DLL together with script-manager.js (scripts/embed-script.cjs): no copy on disk.
// Original startup exceptions must retain their original propagation behavior.
const puerts = require('puerts');
console.log('[PBZMOD] bootstrap entered');
try {
    puerts.__require('MainStart');
} catch (error) {
    console.error('[PBZMOD] original MainStart failed: ' + String(error.stack || error));
    throw error;
}
console.log('[PBZMOD] original MainStart returned');
if (!globalThis.__PBZModLoader) {
    const state = globalThis.__PBZModLoader = { version: 1, mods: [], status: 'loading' };
    const log = message => console.log('[PBZMOD] ' + message);
    try {
        const manager = require('./manager');
        // The DLL answers a read of this script's path with its current mail: the MOD list.
        const readMail = () => JSON.parse(puerts.loadModule(__filename));
        const mail = readMail();
        if (mail.error) throw new Error(mail.error);
        const importer = revision => manager.createImporter(puerts.genRequire, mail.config.root, revision);
        state.mods = manager.load(mail.config, importer(mail.revision), log);
        state.status = 'ready';
        state.reloadTimer = manager.watch(state, readMail, importer, log, setInterval, manager.createNotifier(require, log));
        console.log('[PBZMOD] ready loaded=' + state.mods.filter(m => m.status === 'loaded').length +
            ' failed=' + state.mods.filter(m => m.status === 'failed').length);
    } catch (error) {
        state.status = 'failed';
        console.error('[PBZMOD] configuration failed: ' + String(error.stack || error));
    }
}
