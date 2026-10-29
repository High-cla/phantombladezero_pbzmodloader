'use strict';
// Original startup exceptions must retain their original propagation behavior.
require('MainStart');
console.log('[PBZMOD] original MainStart returned');
if (!globalThis.__PBZModLoader) {
    const state = globalThis.__PBZModLoader = { version: 1, mods: [], status: 'loading' };
    try {
        state.mods = require('./manager').load(require('./generated-config'), require,
            message => console.log('[PBZMOD] ' + message));
        state.status = 'ready';
        console.log('[PBZMOD] ready loaded=' + state.mods.filter(m => m.status === 'loaded').length +
            ' failed=' + state.mods.filter(m => m.status === 'failed').length);
    } catch (error) {
        state.status = 'failed';
        console.error('[PBZMOD] configuration failed: ' + String(error.stack || error));
    }
}
