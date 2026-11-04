'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
function verify(log){
    const marker='[PBZMOD] api-audit-ftext ';
    const rows=log.split(/\r?\n/).filter(line=>line.includes(marker)).map(line=>JSON.parse(line.slice(line.indexOf(marker)+marker.length)));
    assert.equal(rows.length,1,'Expected exactly one complete FText observation');
    const r=rows[0];assert.equal(r.schemaVersion,1);
    assert.deepEqual(r.display,{width:1280,height:720,mode:2});
    assert.deepEqual(r.newObject,{classPath:'/Script/UMG.TextBlock',actualClass:'TextBlock',valid:true});
    assert.equal(typeof r.label,'string');assert.ok(r.label.length>0);
    for(const name of ['converted','widget','array','map']){
        assert.equal(r[name].type,'object',name+' must expose native text');
        assert.equal(r[name].readback,r.label,name+' roundtrip');
    }
    assert.equal(r.property.type,'object');assert.equal(r.property.readback,r.label);
    assert.equal(r.property.writtenType,'object');assert.equal(r.property.written,'属性 '+r.label);
    assert.ok(typeof r.directString.error==='string'||r.directString.value==='','Direct string must be rejected or produce empty text');
    return {passed:true,...r};
}
module.exports={verify};
if(require.main===module){
    const [input,output]=process.argv.slice(2);
    if(!input||!output)throw Error('Usage: node tests/verify-text-mapping.cjs <loader.log> <new-report.json>');
    const bytes=fs.readFileSync(input),r=verify(bytes.toString('utf8'));
    fs.writeFileSync(output,JSON.stringify({...r,source:{path:input,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}},null,2)+'\n',{flag:'wx'});
    console.log('FText conversion, widget method/property and container roundtrips verified.');
}
