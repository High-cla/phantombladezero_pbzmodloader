'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {generate, parseReflection, canonical} = require('../scripts/generate-sdk.cjs');
const supplemental = {modules:{ue:{}}};
const checks = Object.fromEntries(['vector','actorInheritance','playerPawnSignature','axisEnum','objectArrayStable','reflectionIdentitiesStable'].map(k=>[k,true]));
const type = (name, extra={}) => ({path:'/Script/Test.'+name,name,kind:'Class',source:'native',super:null,properties:[],functions:[],...extra});
const prop = (name,kind,extra={}) => ({name,kind,arrayDim:1,parameter:false,out:false,const:false,return:false,...extra});
const fn = (name,properties,extra={}) => ({path:'/Script/Test.Owner.'+name,name,kind:'Function',source:'native',owner:'/Script/Test.Owner',static:false,properties,parameterCount:properties.filter(p=>p.parameter).length,functionFlags:'0x400',...extra});
const capture = (records, name='one', extra={}) => ({name,sha256:'fixture',data:{manifest:{schemaVersion:1,build:'test',exeSha256:'test',checks,...extra},records}});
const decls = r => [...r.files.values()].join('\n');

test('large enum constants require exact build-specific runtime evidence; rounded values stay omitted',()=>{
    const e=type('E',{kind:'Enum',values:[{name:'E::Flag',value:'576460752303423488'},{name:'E::MAX',value:'576460752303423489'}]});
    const bindingVerification={build:'test',exeSha256:'test',evidence:'fixture.json',enumValues:e.values.map(v=>({path:e.path,member:v.name,value:v.value,runtimeType:'number',runtimeInteger:'576460752303423488'}))};
    const result=generate([capture([e])],{...supplemental,bindingVerification});
    assert.match(decls(result),/"Flag" = 576460752303423488/);
    assert.doesNotMatch(decls(result),/"MAX"/);
    assert.equal(result.report.verifiedLargeEnumValues.length,1);
    assert.equal(result.report.omittedEnumValues[0].reason,'runtime number loses native integer precision');
    assert.equal(generate([capture([e])],supplemental).report.omittedEnumValues.length,2);
    assert.throws(()=>generate([capture([e])],{...supplemental,bindingVerification:{...bindingVerification,exeSha256:'other'}}),/verification build mismatch/);
    const wrong={...bindingVerification,enumValues:bindingVerification.enumValues.map(v=>({...v,runtimeType:'bigint'}))};
    assert.equal(generate([capture([e])],{...supplemental,bindingVerification:wrong}).report.verifiedLargeEnumValues.length,0);
});

test('mapping preserves bigint, nullable objects, containers, out/const-ref and parameter order',()=>{
    const f=fn('Call',[
        prop('large','Int64Property',{parameter:true}),
        prop('out value','DoubleProperty',{parameter:true,out:true}),
        prop('constValue','StructProperty',{parameter:true,out:true,const:true,reference:true,target:'/Script/Test.Vector'}),
        prop('local','IntProperty'),
        prop('ReturnValue','ObjectProperty',{parameter:true,return:true,target:'/Script/Test.Owner'})
    ],{static:true});
    const owner=type('Owner',{functions:[f.path],properties:[prop('Values','ArrayProperty',{inner:prop('inner','UInt64Property')}),prop('Fixed','IntProperty',{arrayDim:3}),prop('Map','MapProperty',{key:prop('key','NameProperty'),value:prop('value','BoolProperty')}),prop('Set','SetProperty',{inner:prop('element','StrProperty')})]});
    const result=generate([capture([owner,type('Vector',{kind:'ScriptStruct'}),f])],supplemental), text=decls(result);
    assert.match(text,/"Call"\(large: bigint, _out_value: \$Ref<number>, constValue: UE.Vector\): UE.Owner \| null \| undefined/);
    assert.match(text,/UE.TArray<bigint>/); assert.match(text,/UE.FixSizeArray<number>/);
    assert.match(text,/UE.TMap<string, boolean>/); assert.match(text,/UE.TSet<string>/);
    assert.doesNotMatch(text,/local:|large\?:|\bany\b/);
    assert.equal(result.report.ignoredLocals,1);
});

test('delegate signatures and unsupported fields are explicit; unknown functions are omitted',()=>{
    const delegate=fn('Changed__DelegateSignature',[prop('Value','StrProperty',{parameter:true})]);
    const bad=fn('Unsupported',[prop('Arg','OptionalProperty',{parameter:true})]);
    const owner=type('Owner',{functions:[delegate.path,bad.path],properties:[prop('Changed','MulticastInlineDelegateProperty',{target:delegate.path}),prop('Unknown','OptionalProperty'),prop('Broken','EnumProperty',{unresolved:true})]});
    const result=generate([capture([owner,delegate,bad])],supplemental), text=decls(result);
    assert.match(text,/\$MulticastDelegate<\(Value: string\) => void>/);
    assert.match(text,/readonly "Unknown": UE.\$Unresolved</);
    assert.equal(result.report.unresolvedProperties.length,2);
    assert.equal(result.report.omittedMembers.length,2);
    assert.doesNotMatch(text,/"Unsupported"\(|\bany\b/);
});

test('merge is deterministic, normalizes mixin aliases, and reports added class functions',()=>{
    const f=fn('Call',[]), added=fn('Added',[]), owner=type('Owner',{functions:[f.path]});
    const a=capture([owner,f],'a');
    const alias={...f,name:'Call__puerts_mixin__',path:f.path+'__puerts_mixin__'};
    const b=capture([{...owner,functions:[added.path,alias.path,f.path]},{...f,functionFlags:'0x0',objectIndex:99},alias,added],'b');
    const x=generate([a,b],supplemental), y=generate([b,a],supplemental);
    assert.deepEqual([...x.files],[...y.files]); assert.deepEqual(x.report,y.report);
    assert.equal(x.report.conflicts.length,0); assert.equal(x.report.implementationChanges.length,2);
    assert.match(decls(x),/"Added"\(\): void/); assert.doesNotMatch(decls(x),/__puerts_mixin__/);
});

test('changed signatures, mixed builds, duplicate records and invalid captures fail closed',()=>{
    const f=fn('Call',[prop('x','IntProperty',{parameter:true})]), owner=type('Owner',{functions:[f.path]});
    const a=capture([owner,f],'a');
    assert.throws(()=>generate([a,capture([owner,{...f,properties:[prop('x','StrProperty',{parameter:true})]}],'b')],supplemental),/Conflicting definitions/);
    assert.throws(()=>generate([a,capture([owner,f],'b',{build:'different'})],supplemental),/different game builds/);
    assert.throws(()=>generate([capture([owner,owner])],supplemental),/Duplicate/);
    assert.throws(()=>generate([capture([owner],'bad',{checks:{}})],supplemental),/validation failed/);
});

test('dangling references and inheritance cycles cannot produce a release',()=>{
    assert.throws(()=>generate([capture([type('Owner',{properties:[prop('Missing','ObjectProperty',{target:'/Script/Test.Missing'})]})])],supplemental),/Dangling type/);
    assert.throws(()=>generate([capture([type('A',{super:'/Script/Test.B'}),type('B',{super:'/Script/Test.A'})])],supplemental),/Inheritance cycle/);
});

test('blueprint name collisions use separate type-only paths and temporary types are excluded',()=>{
    const a=type('Same_C',{path:'/Game/A.Same_C',source:'asset-or-runtime'}), b={...a,path:'/Game/B.Same_C'};
    const result=generate([capture([a,b,type('Temp',{path:'/Engine/Transient.Temp',source:'asset-or-runtime'})])],supplemental);
    assert.notEqual(result.index[a.path].symbol,result.index[b.path].symbol);
    assert.equal(result.report.counts.types,2); assert.equal(result.report.excludedTypes.length,1);
    assert.doesNotMatch(decls(result),/const Same_C/);
    assert.match(decls(result),/interface ReflectedClasses/);
});

test('unsafe enum integers are preserved losslessly and excluded from numeric declarations',()=>{
    const e=parseReflection('{"path":"/Script/Test.E","name":"E","kind":"Enum","source":"native","values":[{"name":"E::Large","value":9223372036854775807},{"name":"E::Small","value":1}]}');
    assert.equal(e.values[0].value,'9223372036854775807');
    const result=generate([capture([e])],supplemental);
    assert.equal(result.report.omittedEnumValues[0].value,'9223372036854775807');
    assert.match(decls(result),/"Small" = 1/); assert.doesNotMatch(decls(result),/Large/);
});

test('observed FName casing produces optional aliases without hiding type conflicts',()=>{
    const a=capture([type('Owner',{properties:[prop('glow','IntProperty')]})],'a');
    const b=capture([type('Owner',{properties:[prop('Glow','IntProperty')]})],'b');
    const result=generate([a,b],supplemental);
    assert.match(decls(result),/"Glow"\?: number/);
    assert.match(decls(result),/"glow"\?: number/);
    assert.equal(result.report.memberNameVariants.length,1);
    assert.throws(()=>generate([a,capture([type('Owner',{properties:[prop('Glow','StrProperty')]})],'b')],supplemental),/Conflicting definitions/);
});

test('lazy captures are read once in deterministic filename order',()=>{
    const seen=[];
    const input=name=>({name,read(){seen.push(name);return capture([type('Owner')],name);}});
    // A read result supplies data and sha256, not a retained parsed capture array.
    const result=generate([input('b'),input('a')],supplemental);
    assert.deepEqual(seen,['a','b']);assert.equal(result.report.counts.types,1);
});

test('resolved enum upgrades preserve known schema and report missing metadata',()=>{
    const raw=Buffer.alloc(128);raw.writeUInt32LE(1,0x30);raw.writeUInt32LE(1,0x34);raw.writeUInt32LE(156,0x44);
    assert.deepEqual(canonical({kind:'EnumProperty',unresolved:true,rawHeaderHex:raw.toString('hex')}),{arrayDim:1,elementSize:1,kind:'EnumProperty',offset:156,unresolved:true});
    const p=prop('Comparison','EnumProperty',{unresolved:true});
    const good={...p,unresolved:undefined,enum:null,enumMetadataMissing:true,underlying:prop('storage','ByteProperty')};
    const a=capture([type('Owner',{properties:[p]})],'a');
    const b=capture([type('Owner',{properties:[good]})],'b');
    for(const inputs of [[a,b],[{...b,name:'a'},{...a,name:'b'}]]) {
        const r=generate(inputs,supplemental);
        assert.match(decls(r),/"Comparison": number/);
        assert.equal(r.report.propertyResolutions.length,1);
        assert.equal(r.report.metadataLimitedProperties.length,1);
    }
    assert.throws(()=>generate([a,capture([type('Owner',{properties:[{...good,out:true}]})],'b')],supplemental),/Conflicting/);
    assert.throws(()=>generate([a,capture([type('Owner',{properties:[{...good,arrayDim:2}]})],'b')],supplemental),/Conflicting/);
    const r=generate([capture([type('Owner',{properties:[{...good,enumMetadataMissing:undefined}]})])],supplemental);
    assert.equal(r.report.unresolvedProperties.length,1);
});

test('field paths map through nested containers and function parameters',()=>{
    const f=fn('SetPath',[prop('path','FieldPathProperty',{parameter:true})]);
    const owner=type('Owner',{functions:[f.path],properties:[prop('Paths','ArrayProperty',{inner:prop('p','FieldPathProperty')})]});
    const r=generate([capture([owner,f])],supplemental);
    assert.match(decls(r),/"Paths": UE.TArray<string>/);
    assert.match(decls(r),/"SetPath"\(path: string\): void/);
    assert.equal(r.report.unresolvedProperties.length,0);
});

test('native FText stays distinct from strings in fields, containers and ref parameters',()=>{
    const f=fn('UseText',[
        prop('text','TextProperty',{parameter:true}),
        prop('copy','TextProperty',{parameter:true,out:true}),
        prop('ReturnValue','TextProperty',{parameter:true,return:true})
    ]);
    const owner=type('Owner',{functions:[f.path],properties:[
        prop('Title','TextProperty'),
        prop('Labels','ArrayProperty',{inner:prop('element','TextProperty')})
    ]});
    const result=generate([capture([owner,f])],supplemental);
    assert.match(decls(result),/"Title": UE\.\$FText/);
    assert.match(decls(result),/"Labels": UE\.TArray<UE\.\$FText>/);
    assert.match(decls(result),/"UseText"\(text: UE\.\$FText, copy: \$Ref<UE\.\$FText>\): UE\.\$FText/);
});

test('available capture inputs reproduce every checked-in generated file and report',t=>{
    const root=path.resolve(__dirname,'..');
    const saved=JSON.parse(fs.readFileSync(path.join(root,'sdk/generation-report.json')));
    const inputs=saved.captures.map(c=>({c,file:path.join(root,'build/reflection',c.name)}));
    if(inputs.some(i=>!fs.existsSync(i.file))) {t.skip('Raw game captures are local build artifacts');return;}
    const result=generate(inputs.map(({c,file})=>({name:c.name,read(){
        const bytes=fs.readFileSync(file), sha256=crypto.createHash('sha256').update(bytes).digest('hex');
        assert.equal(sha256,c.sha256);return {name:c.name,sha256,data:parseReflection(bytes)};
    }})),require('../scripts/sdk-supplemental.json'));
    assert.deepEqual(result.report,saved);
    assert.deepEqual(result.index,JSON.parse(fs.readFileSync(path.join(root,'sdk/type-index.json'))));
    assert.deepEqual([...result.files.keys()].sort(),fs.readdirSync(path.join(root,'sdk/types/generated')).sort());
    for(const [name,text] of result.files) assert.equal(fs.readFileSync(path.join(root,'sdk/types/generated',name),'utf8'),text,name);
});
