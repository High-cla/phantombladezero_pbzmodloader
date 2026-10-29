// Minimal declaration for the demonstrated API; not a full UE type dump.
declare function require(name: 'puerts'): {
    argv: { getByName(name: 'GameInstance'): { GetName(): string } | undefined };
};
const gi = require('puerts').argv.getByName('GameInstance');
if (!gi) throw new Error('GameInstance missing');
console.log('[PBZMOD] hello GameInstance=' + gi.GetName());
export const name = 'hello';
