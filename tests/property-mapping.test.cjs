'use strict';
const {verify:verifyTextMapping}=require('./verify-text-mapping.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {decode}=require('./verify-property-mapping.cjs');
const {decode:decodeBindings}=require('./verify-binding-support.cjs');
const rows=[{event:'begin',count:1,display:{width:1280,height:720,mode:2}},{event:'property',owner:'/Test.A',member:'Field'},{event:'end',count:1}];
function frames(rows) {return rows.flatMap((row,id)=>{const text=JSON.stringify(row);return Array.from({length:Math.ceil(text.length/20)},(_,part)=>'[PBZMOD] property-mapping '+JSON.stringify({id,part,parts:Math.ceil(text.length/20),text:text.slice(part*20,part*20+20)}));});}

test('FText evidence requires native values and actual method, property and container roundtrips',()=>{
    const value={type:'object',readback:'文本'};
    const row={schemaVersion:1,display:{width:1280,height:720,mode:2},newObject:{classPath:'/Script/UMG.TextBlock',actualClass:'TextBlock',valid:true},label:'文本',converted:value,widget:value,array:value,map:value,
        property:{...value,writtenType:'object',written:'属性 文本'},directString:{type:'object',value:''}};
    const log=x=>'[PBZMOD] api-audit-ftext '+JSON.stringify(x);
    assert.equal(verifyTextMapping(log(row)).passed,true);
    assert.throws(()=>verifyTextMapping(''),/exactly one/);
    assert.throws(()=>verifyTextMapping(log(row)+'\n'+log(row)),/exactly one/);
    assert.throws(()=>verifyTextMapping(log({...row,converted:{type:'string',readback:'文本'}})),/native text/);
    assert.throws(()=>verifyTextMapping(log({...row,array:{type:'object',readback:''}})),/roundtrip/);
    assert.throws(()=>verifyTextMapping(log({...row,directString:{value:'direct string'}})),/rejected or produce empty/);
});

test('binding verification excludes a crash tail and rejects unmatched native-operation breadcrumbs',()=>{
    const rows=[{event:'begin',sequence:1,display:{width:1280,height:720,mode:2}},{event:'before',sequence:1,step:'call'},{event:'after',sequence:1,step:'call'},{event:'end',sequence:1}];
    const log=r=>r.map(x=>'[PBZMOD] binding-support '+JSON.stringify(x)).join('\n');
    assert.deepEqual(decodeBindings(log(rows)),rows);
    assert.throws(()=>decodeBindings(log(rows.slice(0,2))),/Incomplete/);
    assert.throws(()=>decodeBindings(log([rows[0],rows[2],rows[3]])),/mismatch/);
    assert.throws(()=>decodeBindings(log([...rows,{...rows[0],sequence:2} ,{...rows[1],sequence:2} ])),/Incomplete/);
    assert.throws(()=>decodeBindings(log([rows[0],rows[1],rows[1],rows[2],rows[3]])),/Unfinished/);
});
test('property evidence rejects missing, duplicated and incomplete log frames',()=>{
    const log=frames(rows);assert.deepEqual(decode(log.join('\n')),rows);
    assert.throws(()=>decode(log.slice(1).join('\n')),/Missing/);
    assert.throws(()=>decode([...log,log[0]].join('\n')),/Duplicate/);
    assert.throws(()=>decode(frames(rows.slice(0,-1)).join('\n')),/Incomplete/);
    assert.throws(()=>decode(frames([rows[0],rows[2]]).join('\n')),/count/);
    assert.throws(()=>decode(frames([{...rows[0],display:{width:1920,height:1080,mode:0}},...rows.slice(1)]).join('\n')),/display/);
});
