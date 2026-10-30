'use strict';
// Developer MOD: registry metadata only. Does not load assets or create actors.
const UE = require('ue');
const puerts = require('puerts');
const run = String(Date.now());
let ticks = 0, assets, cursor = 0, emitted = 0, started = false;
const classes = {}, queue = [];
const tagNames = ['GeneratedClass', 'GeneratedClassPath', 'ParentClass', 'NativeParentClass'];
function emit(value) {
    // The loader ring stores bounded UTF-16 messages. Frame long records explicitly.
    const text = JSON.stringify(value), id = emitted++;
    for (let at = 0; at < text.length; at += 500) queue.push({run, id, part: at / 500, parts: Math.ceil(text.length / 500), text: text.slice(at, at + 500)});
}
function display() {
    const settings = UE.GameUserSettings.GetGameUserSettings();
    const size = settings.GetScreenResolution(), mode = settings.GetFullscreenMode();
    if (size.X !== 1280 || size.Y !== 720 || mode !== 2) throw Error('Require 1280x720 windowed');
    return {width: size.X, height: size.Y, mode};
}
let completed = false;
const timer = setInterval(() => {
    try {
        if (!started) {
            if (++ticks < 300) return;
            const gi = puerts.argv.getByName('GameInstance');
            if (!gi) { if (ticks > 1200) throw Error('GameInstance timeout'); return; }
            const screen = display();
            const registry = UE.AssetRegistryHelpers.GetAssetRegistry();
            if (!registry) throw Error('AssetRegistry unavailable');
            if (registry.IsLoadingAssets()) { if (ticks > 1200) throw Error('Registry timeout'); return; }
            const out = puerts.$ref(UE.NewArray(UE.AssetData));
            if (!registry.GetAllAssets(out, true)) throw Error('GetAllAssets failed');
            assets = puerts.$unref(out);
            started = true;
            emit({event: 'begin', schemaVersion: 1, display: screen,
                map: UE.GameplayStatics.GetCurrentLevelName(gi, true), totalAssets: assets.Num(),
                engine: UE.KismetSystemLibrary.GetEngineVersion(),
                scope: 'On-disk registry; type-like asset classes only; no asset loads',
                container: 'NewArray(UE.AssetData)', searchAllAssets: registry.IsSearchAllAssets()});
        }
        if (!completed && queue.length < 40) {
            display();
            // Bound work per tick; all classes are counted even when no type row is emitted.
            for (let n = 0; n < 150 && cursor < assets.Num(); n++, cursor++) {
                const a = assets.Get(cursor), cp = a.AssetClassPath;
                const classPath = cp.PackageName + '.' + cp.AssetName;
                classes[classPath] = (classes[classPath] || 0) + 1;
                if (!/Blueprint|Class|Struct|Enum/.test(cp.AssetName)) continue;
                const tags = {};
                for (const name of tagNames) {
                    const out = puerts.$ref('');
                    if (UE.AssetRegistryHelpers.GetTagValue(a, name, out)) tags[name] = puerts.$unref(out);
                }
                emit({event: 'asset', path: a.PackageName + '.' + a.AssetName, classPath, tags,
                    loaded: UE.AssetRegistryHelpers.IsAssetLoaded(a)});
            }
            if (cursor === assets.Num()) {
                emit({event: 'end', totalAssets: cursor, classes});
                completed = true; assets = undefined;
            }
        }
    } catch (e) {
        emit({event: 'error', message: String(e && e.stack || e)});
        completed = true; started = true; assets = undefined;
    }
    // Stay below the loader's 256-message ring; collector checks every frame.
    for (let i = 0; i < 40 && queue.length; i++) console.log('[PBZMOD] asset-inventory ' + JSON.stringify(queue.shift()));
    if (completed && !queue.length) clearInterval(timer);
}, 100);
exports.stop = () => { clearInterval(timer); assets = undefined; queue.length = 0; };
