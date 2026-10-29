'use strict';
// Developer-only read probe. Install temporarily as mods/api-probe/main.js.
// Wait for the UI/display check; retry on each new map, without retaining objects.
const UE = require('ue');
const puerts = require('puerts');
let lastMap;
let ticks = 0;
const timer = setInterval(() => {
    if (++ticks < 30) return;
    if (ticks > 600) { clearInterval(timer); return; }
    const gi = puerts.argv.getByName('GameInstance');
    if (!gi) return;
    const map = UE.GameplayStatics.GetCurrentLevelName(gi, true);
    if (!map || map === lastMap) return;
    lastMap = map;
    function check(name, run) {
        try {
            const value = run();
            console.log('[PBZMOD] api-probe ' + JSON.stringify({ map, name, ok: true, value }));
            return value;
        } catch (error) {
            console.log('[PBZMOD] api-probe ' + JSON.stringify({ map, name, ok: false, error: String(error) }));
        }
    }
    const nameOf = object => object == null ? null : object.GetName();
    const display = check('display', () => {
        const settings = UE.GameUserSettings.GetGameUserSettings();
        const size = settings.GetScreenResolution();
        return { x: size.X, y: size.Y, mode: settings.GetFullscreenMode() };
    });
    if (!display || display.x !== 1280 || display.y !== 720 || display.mode !== 2) {
        clearInterval(timer);
        console.log('[PBZMOD] api-probe aborted: require 1280x720 windowed');
        return;
    }
    check('Object.GetName', () => gi.GetName());
    check('Object.GetClass', () => nameOf(gi.GetClass()));
    check('Object.GetOuter', () => nameOf(gi.GetOuter()));
    check('GameInstance.GetWorld', () => nameOf(gi.GetWorld()));
    for (const method of ['GetGameInstance', 'GetGameMode', 'GetGameState']) {
        check('GameplayStatics.' + method, () => nameOf(UE.GameplayStatics[method](gi)));
    }
    for (const method of ['GetPlayerController', 'GetPlayerPawn', 'GetPlayerCharacter', 'GetPlayerCameraManager']) {
        check('GameplayStatics.' + method, () => nameOf(UE.GameplayStatics[method](gi, 0)));
    }
    for (const method of ['GetTimeSeconds', 'GetRealTimeSeconds', 'GetWorldDeltaSeconds', 'IsGamePaused']) {
        check('GameplayStatics.' + method, () => UE.GameplayStatics[method](gi));
    }
    for (const method of ['GetObjectName', 'GetPathName', 'GetDisplayName', 'IsValid']) {
        check('KismetSystemLibrary.' + method, () => UE.KismetSystemLibrary[method](gi));
    }
    for (const method of ['GetEngineVersion', 'GetGameName']) {
        check('KismetSystemLibrary.' + method, () => UE.KismetSystemLibrary[method]());
    }
    check('puerts.argv.getByIndex', () => nameOf(puerts.argv.getByIndex(0)));
    check('puerts.$ref/$unref/$set', () => {
        const ref = puerts.$ref(12);
        const before = puerts.$unref(ref);
        puerts.$set(ref, 34);
        return [before, puerts.$unref(ref)];
    });
    const pawn = UE.GameplayStatics.GetPlayerPawn(gi, 0);
    if (pawn) {
        for (const method of ['K2_GetActorLocation', 'GetActorScale3D', 'GetVelocity']) {
            check('Actor.' + method, () => { const v = pawn[method](); return [v.X, v.Y, v.Z]; });
        }
        check('Actor.K2_GetActorRotation', () => { const r = pawn.K2_GetActorRotation(); return [r.Pitch, r.Yaw, r.Roll]; });
        check('Pawn.GetController', () => nameOf(pawn.GetController()));
    }
    const pc = UE.GameplayStatics.GetPlayerController(gi, 0);
    if (pc) check('Controller.GetPawn', () => nameOf(pc.GetPawn()));
}, 2000);
