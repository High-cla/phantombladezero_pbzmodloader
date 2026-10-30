'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {decode}=require('./verify-property-mapping.cjs');
const rows=[{event:'begin',count:1,display:{width:1280,height:720,mode:2}},{event:'property',owner:'/Test.A',member:'Field'},{event:'end',count:1}];
function frames(rows) {return rows.flatMap((row,id)=>{const text=JSON.stringify(row);return Array.from({length:Math.ceil(text.length/20)},(_,part)=>'[PBZMOD] property-mapping '+JSON.stringify({id,part,parts:Math.ceil(text.length/20),text:text.slice(part*20,part*20+20)}));});}
test('property evidence rejects missing, duplicated and incomplete log frames',()=>{
    const log=frames(rows);assert.deepEqual(decode(log.join('\n')),rows);
    assert.throws(()=>decode(log.slice(1).join('\n')),/Missing/);
    assert.throws(()=>decode([...log,log[0]].join('\n')),/Duplicate/);
    assert.throws(()=>decode(frames(rows.slice(0,-1)).join('\n')),/Incomplete/);
    assert.throws(()=>decode(frames([rows[0],rows[2]]).join('\n')),/count/);
    assert.throws(()=>decode(frames([{...rows[0],display:{width:1920,height:1080,mode:0}},...rows.slice(1)]).join('\n')),/display/);
});
