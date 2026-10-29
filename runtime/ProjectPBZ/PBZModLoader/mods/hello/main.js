"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.name = void 0;
exports.stop = stop;
const puerts_1 = require("puerts");
const gi = puerts_1.argv.getByName('GameInstance');
if (!gi)
    throw new Error('GameInstance missing');
console.log('[PBZMOD] hello GameInstance=' + gi.GetName());
exports.name = 'hello';
// No persistent resources; opt in to the hot-reload lifecycle.
function stop() { }
