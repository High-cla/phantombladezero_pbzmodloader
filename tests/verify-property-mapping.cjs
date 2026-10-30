'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
function decode(log) {
    const frames=new Map();
    for(const line of log.split(/\r?\n/)) {
        const marker='[PBZMOD] property-mapping ',at=line.indexOf(marker);if(at<0)continue;
        const f=JSON.parse(line.slice(at+marker.length));
        if(!Number.isInteger(f.id)||f.id<0||!Number.isInteger(f.parts)||f.parts<1||!Number.isInteger(f.part)||f.part<0||f.part>=f.parts||typeof f.text!=='string')throw Error('Invalid frame');
        if(!frames.has(f.id))frames.set(f.id,{parts:f.parts,chunks:new Map()});
        const r=frames.get(f.id);if(r.parts!==f.parts||r.chunks.has(f.part))throw Error('Duplicate/conflicting frame');r.chunks.set(f.part,f.text);
    }
    const rows=[];
    for(let id=0;id<frames.size;id++) {
        const f=frames.get(id);if(!f||f.chunks.size!==f.parts)throw Error('Missing frame');
        rows.push(JSON.parse(Array.from({length:f.parts},(_,i)=>f.chunks.get(i)).join('')));
    }
    if(rows[0]?.event!=='begin'||rows.at(-1)?.event!=='end'||rows.some(r=>r.event==='fatal'))throw Error('Incomplete/failed probe');
    if(JSON.stringify(rows[0].display)!==JSON.stringify({width:1280,height:720,mode:2}))throw Error('Invalid display');
    const props=rows.filter(r=>r.event==='property');
    if(rows[0].count!==props.length||rows.at(-1).count!==props.length||new Set(props.map(r=>r.owner+':'+r.member)).size!==props.length)throw Error('Property count/identity mismatch');
    return rows;
}
function verify(first,followup,expected) {
    const properties=first.filter(r=>r.event==='property');
    if(properties.length!==expected.length)throw Error('Target count mismatch');
    for(const target of expected) {
        const p=properties.find(p=>p.owner===target.owner&&p.member===target.member);
        if(!p||p.kind!==target.kind||p.descriptor?.get!=='function'||p.descriptor?.set!=='function')throw Error('Missing property binding');
        if(target.reflectionUnresolved&&(p.read?.type!=='number'||p.error))throw Error('Enum read failed');
    }
    const roundtrip=followup.find(r=>r.event==='field-path-roundtrip'),call=followup.find(r=>r.event==='field-path-function');
    if(roundtrip?.error||roundtrip?.populated?.value!=='/Script/Engine.Actor:bHidden'||roundtrip?.copied?.value!==roundtrip.populated.value||!roundtrip.invalid?.includes('invalid FieldPath'))throw Error('Field path roundtrip failed');
    if(call?.error||call?.validInputAccepted!==true||!call.invalid?.includes('invalid FieldPath'))throw Error('Function marshaling failed');
    return {properties,roundtrip,call,optionalWrite:followup.find(r=>r.event==='optional-write')};
}
if(require.main===module) {
    const [first,followup,prior,out]=process.argv.slice(2);
    const a=fs.readFileSync(first),b=fs.readFileSync(followup);
    const result=verify(decode(a.toString()),decode(b.toString()),JSON.parse(fs.readFileSync(prior)).unresolvedProperties);
    const report={schemaVersion:1,gameBuild:'CL-301524_JKS-17219',date:'2026-10-30',probe:'tests/property-mapping-probe.js',
        sources:[first,followup].map((path,i)=>({path,sha256:crypto.createHash('sha256').update(i?b:a).digest('hex')})),
        scope:'All 84 getter/setter bindings inspected; 10 numeric enum reads; field-path string roundtrip and null-target function marshaling. No gameplay mutation validation.',
        ...result};
    fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({propertyBindings:result.properties.length,enumReads:result.properties.filter(p=>p.reflectionUnresolved).length,fieldPathRoundtrip:true,functionMarshaling:true}));
}
module.exports={decode,verify};
