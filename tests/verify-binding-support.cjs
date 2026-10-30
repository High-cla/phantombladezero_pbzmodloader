'use strict';
const fs=require('node:fs');
function decode(log) {
    const marker='[PBZMOD] binding-support ';
    const rows=log.split(/\r?\n/).filter(x=>x.includes(marker)).map(x=>JSON.parse(x.slice(x.indexOf(marker)+marker.length)));
    let active=null, pending=null, completed=0;
    for(const row of rows) {
        if(row.event==='begin') {
            if(active||row.sequence!==completed+1||JSON.stringify(row.display)!==JSON.stringify({width:1280,height:720,mode:2}))throw Error('Invalid sequence/display');
            active=row;
        } else {
            if(!active||active.sequence!==row.sequence)throw Error('Unexpected sequence');
            if(row.event==='before') {if(pending)throw Error('Unfinished operation');pending=row.step;}
            else if(row.event==='after') {if(pending!==row.step)throw Error('Operation mismatch');pending=null;}
            else if(row.event==='end') {if(pending)throw Error('Unfinished operation');active=null;completed++;}
            else throw Error('Failed/unknown event');
        }
    }
    if(!completed||active||pending)throw Error('Incomplete probe');
    return rows;
}
function verify(rows,expected) {
    function group(label){const begin=rows.find(r=>r.event==='begin'&&r.label===label);if(!begin)throw Error('Missing command '+label);return rows.filter(r=>r.sequence===begin.sequence&&r.event==='after');}
    const properties=group('55-property-bindings');
    if(properties.length!==expected.length)throw Error('Property count mismatch');
    for(const p of expected) {
        const found=properties.filter(r=>r.step===p.owner+':'+p.member);
        if(found.length!==1||found[0].result.get!=='function'||found[0].result.set!=='function'||found[0].result.error)throw Error('Property binding mismatch');
    }
    const conversions=group('conversion-writes-and-enum-precision');
    const enumValues=conversions.find(r=>r.step==='enum-exact-integers')?.result;
    if(enumValues?.length!==8||new Set(enumValues.map(x=>x.name)).size!==8)throw Error('Enum evidence missing');
    const field=group('fieldpath-typed-and-valid-object');
    if(field.find(r=>r.step==='valid-object')?.result.valid!==true ||
       field.find(r=>r.step==='write-object-fieldpath')?.result.readback.value!=='/Script/Engine.Actor:bHidden'||
       field.find(r=>r.step==='second-write-object-fieldpath')?.result.value!=='/Script/Engine.Actor:bReplicates')throw Error('Object field-path writes failed');
    return {properties,conversions,enumValues,fieldPath:field,crashTargetReplay:group('previous-crash-first-target')};
}
if(require.main===module) {
    const [log,report,out]=process.argv.slice(2);
    fs.writeFileSync(out,JSON.stringify(verify(decode(fs.readFileSync(log,'utf8')),JSON.parse(fs.readFileSync(report)).unresolvedProperties),null,2)+'\n');
}
module.exports={decode,verify};
