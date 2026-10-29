"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.name = void 0;
const gi = require('puerts').argv.getByName('GameInstance');
if (!gi)
    throw new Error('GameInstance missing');
console.log('[PBZMOD] hello GameInstance=' + gi.GetName());
exports.name = 'hello';
