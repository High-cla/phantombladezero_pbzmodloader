import * as UE from 'ue';
import { argv, $ref, $unref, blueprint } from 'puerts';

const vector = new UE.Vector(1, 2, 3);
const x = $ref(0), y = $ref(0), z = $ref(0);
UE.KismetMathLibrary.BreakVector(vector, x, y, z);
const component: number = $unref(x);
const large: bigint = UE.KismetMathLibrary.Add_Int64Int64(9007199254740993n, 2n);
// @ts-expect-error int64 uses bigint, not a lossy JS number.
UE.KismetMathLibrary.Add_Int64Int64(1, 2);
// @ts-expect-error Output parameters require PuerTS refs.
UE.KismetMathLibrary.BreakVector(vector, 0, 0, 0);
// @ts-expect-error Captured metadata does not prove parameter defaults.
UE.KismetMathLibrary.BreakVector(vector);
// @ts-expect-error UObject constructors have not been declared callable.
new UE.Actor();

const array = UE.NewArray(UE.BuiltinInt);
array.Add(4, 5);
const element: number = array.Get(0);
// @ts-expect-error Native arrays are not JS arrays.
array.push(6);
// @ts-expect-error Container element types remain strict.
array.Add('invalid');
const set = UE.NewSet(UE.BuiltinString);
set.Add('a');
const map = UE.NewMap(UE.BuiltinString, UE.BuiltinInt);
map.Add('a', 7);
const maybe: number | undefined = map.Get('missing');
// @ts-expect-error Missing map keys must be handled.
const missing: number = map.Get('missing');

type GameInstanceBP = UE.ReflectedTypes['/Game/PBZContent/Blueprint/BP_GameInstance.BP_GameInstance_C'];
const instance = argv.getByName('GameInstance') as GameInstanceBP | undefined;
if (instance) {
    const name: string = instance.GetName();
    const count: number = instance.AllowedMap.Num();
    const difficulty: UE.EDifficultMode = instance.DifficultMode;
    const softClass: UE.Class | null | undefined = instance.StartupWarningTextDecorator.Get();
    instance.OnPawnControllerChangedDelegates.Add((pawn, controller) => {
        const p: UE.Pawn | null | undefined = pawn;
        const c: UE.Controller | null | undefined = controller;
    });
    // @ts-expect-error Delegate parameters are derived from the native signature.
    instance.OnPawnControllerChangedDelegates.Add((pawn: string) => {});
}
const cls = UE.Class.Load('/Game/PBZContent/Blueprint/BP_GameInstance.BP_GameInstance_C');
if (cls) {
    const typed: UE.$TypedClass<'/Game/PBZContent/Blueprint/BP_GameInstance.BP_GameInstance_C'> = cls;
    const jsType = blueprint.tojs(cls);
    const loaded: GameInstanceBP | null | undefined = jsType.Load('an-existing-object-path');
    const reflectedClass: UE.Class = jsType.StaticClass();
    // @ts-expect-error Cast is not supplied by this game's runtime.
    jsType.Cast(instance);
}
// @ts-expect-error Missing properties must not silently become any.
instance?.NonexistentProperty;
// @ts-expect-error Path lookup contains only collected types.
type MissingType = UE.ReflectedTypes['/Game/NotCollected.NotCollected_C'];
type UnknownField = UE.ReflectedTypes['/SGameAI/Core/AICondition/Condition_Counter.Condition_Counter_C']['ComparisonMethod'];
// @ts-expect-error Unresolved properties cannot be fabricated with arbitrary values.
const unknownField: UnknownField = 1;
// @ts-expect-error Opaque type markers must not advertise fake UE runtime values.
UE.unresolvedBrand;

// @ts-expect-error Cast is not supplied for native types either.
UE.PBZGameInstance.Cast(instance);
// @ts-expect-error No Node.js globals in the game environment.
process.cwd();
// @ts-expect-error No DOM globals in the game environment.
window.document;
