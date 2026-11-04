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
type ComparisonField = UE.ReflectedTypes['/SGameAI/Core/AICondition/Condition_Counter.Condition_Counter_C']['ComparisonMethod'];
const comparisonField: ComparisonField = 1;
// @ts-expect-error Missing enum names do not make storage untyped.
const invalidComparison: ComparisonField = 'Greater';
type UnknownField = UE.SoftObjectPath['SubPathString'];
// @ts-expect-error Unresolved properties cannot be fabricated with arbitrary values.
const unknownField: UnknownField = 1;
declare const attribute: UE.GameplayAttribute;
const fieldPath: string = attribute.Attribute;
const largeEnumFlag: UE.ESkeletalMeshAsyncProperties = UE.ESkeletalMeshAsyncProperties.TargetMeshDeformers;
// @ts-expect-error This native integer loses precision in the game's number binding.
UE.ESkeletalMeshAsyncProperties.ESkeletalMeshAsyncProperties_MAX;
attribute.Attribute = '/Script/Engine.Actor:bHidden';
UE.KismetSystemLibrary.SetFieldPathPropertyByName(null, 'Missing', fieldPath);
// @ts-expect-error Field paths require strings.
UE.KismetSystemLibrary.SetFieldPathPropertyByName(null, 'Missing', 123);
// @ts-expect-error Opaque type markers must not advertise fake UE runtime values.
UE.unresolvedBrand;

// @ts-expect-error Cast is not supplied for native types either.
UE.PBZGameInstance.Cast(instance);
// @ts-expect-error No Node.js globals in the game environment.
process.cwd();
// @ts-expect-error No DOM globals in the game environment.
window.document;

// Batch-collected game assets: signatures remain strongly typed by reflected path.
type SummonAbility = UE.ReflectedTypes['/PBZCombatAsset/ActorData/Mobs/000_Hun/Ability/DoubleBlade/GA_Hun_Double_C_JueYing_Summon.GA_Hun_Double_C_JueYing_Summon_C'];
declare const summon: SummonAbility;
const chargeCostRef = $ref(0);
summon.GetUltimateChargeCost(chargeCostRef);
const chargeCost: number = $unref(chargeCostRef);
// @ts-expect-error This Blueprint uses an out parameter, not a return value.
const wrongChargeCost: number = summon.GetUltimateChargeCost(chargeCostRef);
// @ts-expect-error The out parameter must wrap a number.
summon.GetUltimateChargeCost($ref('invalid'));
type AccessoryAbility = UE.ReflectedTypes['/Game/PBZContent/Blueprint/Ability/GameplayEffects/AbilityTree/GA_AddAccessorySlot_Base.GA_AddAccessorySlot_Base_C'];
declare const accessory: AccessoryAbility;
const accessoryTag: UE.GameplayTag = accessory.AccessoryTag;
type LipsyncActor = UE.ReflectedTypes['/HuaShira/Animation/Lipsync/SongXiaowu/EmoTEST.EmoTEST_C'];
declare const lipsync: LipsyncActor;
lipsync.ReceiveTick(0.016);
// @ts-expect-error Reflected Tick delta is numeric.
lipsync.ReceiveTick('invalid');
type Sacrifice = UE.ReflectedTypes['/PBZCombatAsset/ActorData/Mobs/058_MadDoctor/Ability/Abilities/Ceremony/ST_SacrificeVar.ST_SacrificeVar'];
declare const sacrifice: Sacrifice;
const sacrificeSide: boolean = sacrifice.LR_1_21DFE38F45FD872FC533C68C7A32B9CE;

// CL-302256_JKS-17280 additions preserve reflected argument and return types.
declare const sequencePlayer: UE.MovieSceneSequencePlayer;
const primeAction: UE.PBZPrimeAndPlayAction | null | undefined = UE.PBZPrimeAndPlayAction.PrimeAndPlay(instance, sequencePlayer);
const tagListener: UE.AbilityAsync_WaitGameplayTagCountDelta | null | undefined = UE.AbilityAsync_WaitGameplayTagCountDelta.WaitGameplayTagCountChangeOnActor(null, accessoryTag);
declare const nonLethalCalculator: UE.DamageCalculator_PBZPlayerNonLethal;
const originalCalculator: UE.DamageCalculatorBase | null | undefined = nonLethalCalculator.OriginalCalculator;
// @ts-expect-error Sequence playback requires a reflected player object.
UE.PBZPrimeAndPlayAction.PrimeAndPlay(instance, 'sequence');
// @ts-expect-error A GameplayTag is a reflected struct, not a string.
UE.AbilityAsync_WaitGameplayTagCountDelta.WaitGameplayTagCountChangeOnActor(null, 'Combat.Test');

// FText is a native value, distinct from a JavaScript string.
declare const labelWidget: UE.TextBlock;
const nativeText: UE.$FText = UE.KismetTextLibrary.Conv_StringToText('采集文本');
labelWidget.SetText(nativeText);
labelWidget.Text = nativeText;
const labelString: string = UE.KismetTextLibrary.Conv_TextToString(labelWidget.GetText());
const textArray = UE.NewArray(UE.BuiltinText);
textArray.Add(nativeText);
const textElement: UE.$FText = textArray.Get(0);
const textMap = UE.NewMap(UE.BuiltinString, UE.BuiltinText);
textMap.Add('label', nativeText);
// @ts-expect-error Native text cannot be passed off as a JavaScript string.
const wrongTextString: string = nativeText;
// @ts-expect-error TextBlock requires a converted native FText.
labelWidget.SetText('unconverted');
// @ts-expect-error TextProperty setters also require native FText.
labelWidget.Text = 'unconverted';
// @ts-expect-error BuiltinText arrays retain the native value type.
textArray.Add('unconverted');
// @ts-expect-error BuiltinText map values retain the native value type.
textMap.Add('label', 'unconverted');
// @ts-expect-error Native text values cannot be fabricated from plain objects.
const fakeText: UE.$FText = {};
// @ts-expect-error $FText is only a declaration helper, not a runtime value.
UE.$FText;
const textClass = UE.Class.Load('/Script/UMG.TextBlock');
if (textClass) {
    const createdLabel: UE.TextBlock | null | undefined = UE.NewObject(textClass);
    createdLabel?.SetText(nativeText);
}
const genericObject: UE.Object | null | undefined = UE.NewObject(UE.TextBlock.StaticClass());
// @ts-expect-error NewObject requires a class object, not a path string.
UE.NewObject('/Script/UMG.TextBlock');
