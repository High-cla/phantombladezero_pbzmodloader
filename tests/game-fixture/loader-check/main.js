'use strict';
// For a game test of the loader, not for players. Copy this folder into PBZModLoader/mods/ and read loader.log.
// It covers what a MOD can ask of the module system: relative files, JSON, the game's own modules, a late require.
const log = message => console.log('[PBZMOD] loader-check ' + message);
const helper = require('./lib/helper');
const data = require('./lib/data.json');
const gameModule = require('Library/TsHelper');
const UE = require('ue');
log('helper=' + helper.value + ' nested=' + helper.nested + ' json=' + data.name +
    ' gameModule=' + typeof gameModule + ' ue=' + typeof UE.GameplayStatics + ' dir=' + __dirname);
const timer = setTimeout(() => {
    try { log('delayed=' + require('./lib/delayed').value); }
    catch (error) { log('delayed failed: ' + String(error)); }
}, 3000);
exports.stop = () => { clearTimeout(timer); log('stopped'); };
