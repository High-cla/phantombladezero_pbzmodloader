import { argv } from 'puerts';
import { GameplayStatics } from 'ue';

const MOD_ID = 'my-mod';
const SAMPLE_LIMIT = 5;
let samples = 0;
let timer: ReturnType<typeof setInterval> | undefined;

// A local cleanup helper, also exported for callers. The current loader does
// not automatically call stop() on unload, map changes, or game exit.
export function stop(): void {
    if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
        console.log(`[PBZMOD] ${MOD_ID} stopped`);
    }
}

function sample(): void {
    // Obtain a fresh reference each time rather than retaining a world object.
    const gameInstance = argv.getByName('GameInstance');
    if (!gameInstance) throw new Error('GameInstance missing');
    const map = GameplayStatics.GetCurrentLevelName(gameInstance, true);
    console.log(`[PBZMOD] ${MOD_ID} sample=${++samples} GameInstance=${gameInstance.GetName()} map=${map}`);
    if (samples >= SAMPLE_LIMIT) stop();
}

// MODs start at module evaluation. Initial errors propagate to the loader,
// which marks this MOD as failed and continues loading the others.
sample();
timer = setInterval(() => {
    try {
        sample();
    } catch (error) {
        stop();
        console.error(`[PBZMOD] ${MOD_ID} stopped after error: ${String(error)}`);
    }
}, 2000);
