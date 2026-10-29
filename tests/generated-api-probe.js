'use strict';
// Temporary developer MOD. Read-only game calls; containers/structs are local test values.
const UE = require('ue');
const puerts = require('puerts');
let ticks = 0;
const seen = new Set();
const timer = setInterval(() => {
    if (++ticks < 30) return;
    if (ticks > 900) { clearInterval(timer); return; }
    const gi = puerts.argv.getByName('GameInstance');
    if (!gi) return;
    const map = UE.GameplayStatics.GetCurrentLevelName(gi, true);
    if (!map || seen.has(map)) return;
    const settings = UE.GameUserSettings.GetGameUserSettings();
    const size = settings.GetScreenResolution();
    const mode = settings.GetFullscreenMode();
    if (size.X !== 1280 || size.Y !== 720 || mode !== 2) {
        console.error('[PBZMOD] generated-api-probe aborted: require 1280x720 windowed');
        clearInterval(timer); return;
    }
    seen.add(map);
    function check(name, run) {
        try {
            const value = run();
            console.log('[PBZMOD] generated-api-probe ' + JSON.stringify({map, name, ok: true, value}));
        } catch (e) {
            console.log('[PBZMOD] generated-api-probe ' + JSON.stringify({map, name, ok: false, error: String(e)}));
        }
    }
    check('display', () => ({width:size.X,height:size.Y,mode}));
    check('Vector.constructor', () => {const v = new UE.Vector(1,2,3); return [v.X,v.Y,v.Z];});
    check('KismetMathLibrary.BreakVector', () => {
        const x=puerts.$ref(0),y=puerts.$ref(0),z=puerts.$ref(0);
        UE.KismetMathLibrary.BreakVector(new UE.Vector(1,2,3),x,y,z);
        return [puerts.$unref(x),puerts.$unref(y),puerts.$unref(z)];
    });
    check('KismetMathLibrary.Add_Int64Int64', () => {
        const value=UE.KismetMathLibrary.Add_Int64Int64(9007199254740993n,2n);
        return {type:typeof value,value:String(value)};
    });
    check('containers', () => {
        const a=UE.NewArray(UE.BuiltinInt); a.Add(4,5); a.Set(1,6);
        const s=UE.NewSet(UE.BuiltinString); s.Add('x'); s.Add('x');
        const m=UE.NewMap(UE.BuiltinString,UE.BuiltinInt); m.Add('a',7);
        return {array:[a.Num(),a.Get(0),a.Get(1)],set:[s.Num(),s.Get(0)],map:[m.Num(),m.Get('a'),m.Get('missing')],arrayMethods:['GetRef','Contains','FindIndex','RemoveAt','IsValidIndex','Empty'].map(k=>[k,typeof a[k]])};
    });
    check('nativeClass', () => [UE.Actor.StaticClass().GetName(),UE.PBZGameInstance.StaticClass().GetName(),typeof UE.PBZGameInstance.Cast,gi.GetName(),gi.AllowedMap.Num(),gi.DifficultMode]);
    check('softClass', () => {
        const soft=gi.StartupWarningTextDecorator;
        return {get:typeof soft.Get,load:typeof soft.LoadSynchronous,value:soft.Get()?.GetName(),text:UE.KismetSystemLibrary.Conv_SoftClassReferenceToString(soft)};
    });
    check('blueprint', () => {
        const pc=UE.GameplayStatics.GetPlayerController(gi,0);
        const cls=pc.GetClass();
        const path=UE.KismetSystemLibrary.GetPathName(cls);
        const loaded=UE.Class.Load(path);
        const ctor=puerts.blueprint.tojs(loaded);
        return {path,name:loaded.GetName(),staticClass:ctor.StaticClass().GetName(),castAvailable:typeof ctor.Cast,instance:pc.GetName()};
    });
    check('enum', () => [UE.EAxis.X,UE.EAxis.Y,UE.EAxis.Z]);
    check('delegate', () => {
        const d=gi.OnPawnControllerChangedDelegates;
        return ['Add','Remove','Clear','Broadcast'].map(k=>[k,typeof d[k]]);
    });
},1000);
