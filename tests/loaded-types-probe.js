'use strict';
// Binding presence only: never invoke the gameplay methods or property accessors.
exports.run=function() {
    const UE=require('ue'),puerts=require('puerts');
    const settings=UE.GameUserSettings.GetGameUserSettings(),size=settings.GetScreenResolution();
    if(size.X!==1280||size.Y!==720||settings.GetFullscreenMode()!==2)throw Error('Require 1280x720 windowed');
    const samples=[
        {path:'/PBZCombatAsset/ActorData/Mobs/000_Hun/Ability/DoubleBlade/GA_Hun_Double_C_JueYing_Summon.GA_Hun_Double_C_JueYing_Summon_C',method:'GetUltimateChargeCost'},
        {path:'/Game/PBZContent/Blueprint/Ability/GameplayEffects/AbilityTree/GA_AddAccessorySlot_Base.GA_AddAccessorySlot_Base_C',method:'K2_ActivateAbility',property:'AccessoryTag'},
        {path:'/HuaShira/Animation/Lipsync/SongXiaowu/EmoTEST.EmoTEST_C',method:'ReceiveTick',property:'LipAnim'}
    ];
    for(const sample of samples) {
        try {
            const cls=UE.Class.Load(sample.path);if(!cls)throw Error('Missing class');
            const ctor=puerts.blueprint.tojs(cls),methodType=typeof ctor.prototype[sample.method];
            const actual=UE.KismetSystemLibrary.GetPathName(ctor.StaticClass());
            let descriptor,prototype=ctor.prototype;
            while(prototype&&sample.property&&!descriptor){descriptor=Object.getOwnPropertyDescriptor(prototype,sample.property);prototype=Object.getPrototypeOf(prototype);}
            console.log('[PBZMOD] loaded-binding '+JSON.stringify({...sample,ok:actual===sample.path&&methodType==='function',methodType,
                propertyDescriptor:descriptor?{get:typeof descriptor.get,set:typeof descriptor.set}:null}));
        }catch(e){console.log('[PBZMOD] loaded-binding '+JSON.stringify({...sample,ok:false,error:String(e)}));}
    }
};
