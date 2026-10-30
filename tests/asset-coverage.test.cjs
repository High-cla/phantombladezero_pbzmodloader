'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {decode, coverage, classify} = require('../scripts/asset-coverage.cjs');
const a = {event:'asset',path:'/Game/A.A',classPath:'/Script/Engine.Blueprint',tags:{GeneratedClass:"BlueprintGeneratedClass'/Game/A.A_C'"},loaded:false};
const b = {...a,path:'/Game/B.B',tags:{}};
function frames(rows) {return rows.flatMap((r,id)=>{
    const text=JSON.stringify(r), parts=Math.ceil(text.length/45);
    return Array.from({length:parts},(_,part)=>'[12:00] [PBZMOD] asset-inventory '+JSON.stringify({run:'test',id,part,parts,text:text.slice(part*45,(part+1)*45)}));
});}
const rows=[{event:'begin',schemaVersion:1,display:{width:1280,height:720,mode:2},totalAssets:3},a,b,{event:'end',totalAssets:3,classes:{'/Script/Engine.Blueprint':2,'/Script/Engine.Texture2D':1}}];
test('reassembles framed rows; distinguishes evidence from inferred paths',()=>{
    const capture=decode(frames(rows).join('\n'));
    const r=coverage(capture,{'/Game/A.A_C':{}});
    assert.deepEqual(r.counts,{covered:1,'candidate-unverified':1});
    assert.equal(coverage(capture,{}).counts['not-in-sdk'],1);
    assert.equal(classify({...a,classPath:'/Script/Engine.UserDefinedEnum',tags:{}}).typePath,a.path);
});
test('rejects truncated, duplicated, missing and incomplete captures',()=>{
    const good=frames(rows);
    assert.throws(()=>decode(good.slice(1).join('\n')),/Missing/);
    assert.throws(()=>decode([...good,good[0]].join('\n')),/Duplicate/);
    assert.throws(()=>decode(frames(rows.slice(0,-1)).join('\n')),/Incomplete/);
    const missing=[rows[0],a,rows.at(-1)];
    assert.throws(()=>decode(frames(missing).join('\n')),/Missing asset/);
});
test('rejects wrong display and probe errors',()=>{
    assert.throws(()=>decode(frames([{...rows[0],display:{width:1920,height:1080,mode:0}},...rows.slice(1)]).join('\n')),/display/);
    assert.throws(()=>decode(frames([{event:'error',message:'no registry'}]).join('\n')),/no registry/);
});
test('deduplicates blueprint and generated class into one load target',()=>{
    const generated={...a,path:'/Game/A.A_C',classPath:'/Script/Engine.BlueprintGeneratedClass',tags:{}};
    const result=coverage({run:'test',begin:{},end:{totalAssets:2,classes:{}},assets:[a,generated]},{});
    assert.equal(result.counts['not-in-sdk'],2);
    assert.equal(result.uniqueTypePaths,1);
    assert.equal(result.typeCounts['not-in-sdk'],1);
    assert.deepEqual(result.types[0].assetPaths,['/Game/A.A','/Game/A.A_C']);
});
