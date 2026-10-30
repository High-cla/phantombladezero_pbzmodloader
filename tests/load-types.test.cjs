'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {events}=require('../scripts/capture-type-batches.cjs');
const {prepare}=require('../scripts/prepare-type-batches.cjs');
test('batch planner prioritizes requested namespaces without duplicate or inferred targets',()=>{
    const types=['/Other/A.A_C','/HuaShira/B.B_C','/PBZCombatAsset/C.C_C','/Game/D.D_C'].map(typePath=>({typePath,status:'not-in-sdk'}));
    const result=prepare({assets:[],types:[...types,{typePath:'/Game/Guess.Guess_C',status:'candidate-unverified'}]},1,'test');
    assert.deepEqual(result.map(b=>b.paths[0]),[types[2].typePath,types[3].typePath,types[1].typePath,types[0].typePath]);
    assert.deepEqual(result.map(b=>b.sequence),[1,2,3,4]);
    assert.throws(()=>prepare({assets:[],types},513),/size/);
});
test('load protocol pauses after a batch, preserves results, and checks display before loading',()=>{
    let callback,loads=0,valid=true,stopped=false;
    const logs=[],commands={'./commands/0001':{sequence:1,paths:['/Game/A.A_C','/Game/Missing.Missing_C']}};
    const UE={GameUserSettings:{GetGameUserSettings:()=>({GetScreenResolution:()=>({X:valid?1280:1920,Y:720}),GetFullscreenMode:()=>2})},
        Object:{Load:p=>{loads++;return p.includes('Missing')?null:{path:p,GetClass:()=>({GetName:()=> 'BlueprintGeneratedClass'})};}},
        KismetSystemLibrary:{GetPathName:o=>o.path}};
    const context={require:n=>{if(n==='ue')return UE;if(n==='puerts')return {argv:{getByName:()=>({})}};if(commands[n])return commands[n];throw Error('missing');},
        exports:{},setInterval:fn=>{callback=fn;return 1;},clearInterval:()=>{stopped=true;},console:{log:s=>logs.push(s)},Date};
    vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/load-types-probe.js'),'utf8'),context);
    for(let i=0;i<310;i++)callback();
    assert.equal(loads,2);const rows=events(logs.join('\n'));
    assert.equal(rows.filter(e=>e.event==='loaded').length,1);assert.equal(rows.filter(e=>e.event==='failed').length,1);
    assert.equal(rows.filter(e=>e.event==='done').length,1);
    valid=false;commands['./commands/0002']={sequence:2,paths:['/Game/B.B_C']};callback();
    assert.equal(loads,2);assert.equal(stopped,true);assert.equal(events(logs.join('\n')).at(-1).event,'fatal');
});
