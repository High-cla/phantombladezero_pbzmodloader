'use strict';
// Developer probe. Gated by an external command after native window validation.
// Reads class defaults; writes only newly constructed, local struct values.
const UE=require('ue'), puerts=require('puerts');
let held=[], done=false;
function emit(row) {
    const text=JSON.stringify(row),id=emit.id++;
    for(let at=0;at<text.length;at+=300) console.log('[PBZMOD] property-mapping '+JSON.stringify({id,part:at/300,parts:Math.ceil(text.length/300),text:text.slice(at,at+300)}));
}
emit.id=0;
function describe(value) {return {type:typeof value,value:typeof value==='bigint'?String(value):value===null||['number','string','boolean'].includes(typeof value)?value:undefined};}
function descriptor(proto,key) {while(proto){const d=Object.getOwnPropertyDescriptor(proto,key);if(d)return {get:typeof d.get,set:typeof d.set,value:typeof d.value};proto=Object.getPrototypeOf(proto);}return null;}
const timer=setInterval(()=>{
    if(done||!puerts.argv.getByName('GameInstance'))return;
    let command;try{command=require('./command');}catch(_){return;}
    done=true;
    try {
        const s=UE.GameUserSettings.GetGameUserSettings(),v=s.GetScreenResolution();
        if(v.X!==1280||v.Y!==720||s.GetFullscreenMode()!==2)throw Error('Require 1280x720 windowed');
        emit({event:'begin',count:command.targets.length,display:{width:v.X,height:v.Y,mode:2}});
        for(const target of command.targets) {
            const row={event:'property',...target};
            try {
                const native=target.owner.startsWith('/Script/'),name=target.owner.split('.').pop();
                let ctor;
                if(native)ctor=UE[name];else {const cls=UE.Class.Load(target.owner);held.push(cls);ctor=puerts.blueprint.tojs(cls);}
                row.descriptor=descriptor(ctor.prototype,target.member);
                let instance;
                if(target.typeKind==='ScriptStruct')instance=new ctor();
                else instance=UE.Object.Load(target.owner.slice(0,target.owner.lastIndexOf('.')+1)+'Default__'+name);
                held.push(instance);
                row.instance=!!instance;
                if(instance)row.read=describe(instance[target.member]);
                if(instance&&target.typeKind==='ScriptStruct'&&target.write!==undefined) {
                    instance[target.member]=target.write;
                    row.afterWrite=describe(instance[target.member]);
                }
            }catch(e){row.error=String(e);}
            emit(row);
        }
        // Field-path conversion on a temporary struct; class defaults are never mutated.
        try {
            const a=new UE.GameplayAttribute();
            const before=describe(a.Attribute);a.Attribute='/Script/Engine.Actor:bHidden';
            const populated=describe(a.Attribute);
            let invalid;try{a.Attribute='';}catch(e){invalid=String(e);}
            const other=new UE.GameplayAttribute();other.Attribute=a.Attribute;
            emit({event:'field-path-roundtrip',before,populated,copied:describe(other.Attribute),invalid,functionType:typeof UE.KismetSystemLibrary.SetFieldPathPropertyByName});
        }catch(e){emit({event:'field-path-roundtrip',error:String(e)});}
        try {
            const a=new UE.StructSerializerOptionalTestStruct();
            a.IntOptional=123;a.StrOptional='test';
            emit({event:'optional-write',int:describe(a.IntOptional),str:describe(a.StrOptional)});
        }catch(e){emit({event:'optional-write',error:String(e)});}
        try {
            // Null target: tests marshaling only, without creating a UObject or
            // writing any game/default object. This is not a mutation test.
            UE.KismetSystemLibrary.SetFieldPathPropertyByName(null,'PBZProbeMissingField','/Script/Engine.Actor:bHidden');
            let invalid;try{UE.KismetSystemLibrary.SetFieldPathPropertyByName(null,'PBZProbeMissingField','');}catch(e){invalid=String(e);}
            emit({event:'field-path-function',validInputAccepted:true,invalid,scope:'parameter conversion; null target, no mutation'});
        }catch(e){emit({event:'field-path-function',error:String(e)});}
        emit({event:'end',count:command.targets.length});
    }catch(e){emit({event:'fatal',error:String(e)});}
},100);
exports.stop=()=>{clearInterval(timer);held=[];};
