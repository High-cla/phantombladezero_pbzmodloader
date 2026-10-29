import { argv } from 'puerts';
const gi = argv.getByName('GameInstance');
if (!gi) throw new Error('GameInstance missing');
console.log('[PBZMOD] hello GameInstance=' + gi.GetName());
export const name = 'hello';
// No persistent resources; opt in to the hot-reload lifecycle.
export function stop(): void {}
