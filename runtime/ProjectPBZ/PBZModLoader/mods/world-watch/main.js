'use strict';
const puerts = require('puerts');
const UE = require('ue');
let lastMap;
let samples = 0;
let timer;
function sample() {
    try {
        const gi = puerts.argv.getByName('GameInstance');
        const map = UE.GameplayStatics.GetCurrentLevelName(gi, true);
        if (map !== lastMap || ++samples % 30 === 0) {
            console.log('[PBZMOD] world-watch map=' + map + '; GameInstance=' + gi.GetName());
            lastMap = map;
        }
    } catch (error) {
        console.warn('[PBZMOD] world-watch error=' + error);
        if (timer !== undefined) clearInterval(timer);
    }
}
timer = setInterval(sample, 2000);
sample();
exports.stop = function () { clearInterval(timer); };
