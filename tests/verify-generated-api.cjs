'use strict';
// Validates observations and their values, not just absence of thrown exceptions.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const log = process.argv[2];
if (!log) throw Error('Usage: node tests/verify-generated-api.cjs <loader.log>');
const source = fs.readFileSync(log,'utf8');
const rows = source.split(/\r?\n/).filter(line=>line.includes('generated-api-probe {')).map(line=>JSON.parse(line.slice(line.indexOf('generated-api-probe ')+20)));
const maps = ['PBZ_StartMenu_CE_WP','PBZ_Xigu_WP'];
for (const map of maps) {
    const items=rows.filter(r=>r.map===map), byName=Object.fromEntries(items.map(r=>[r.name,r]));
    assert.equal(items.length,10,map+' must have ten distinct probe results');
    assert.equal(Object.keys(byName).length,10);
    for (const row of items) assert.equal(row.ok,true,row.name+': '+row.error);
    assert.deepEqual(byName.display.value,{width:1280,height:720,mode:2});
    assert.deepEqual(byName['Vector.constructor'].value,[1,2,3]);
    assert.deepEqual(byName['KismetMathLibrary.BreakVector'].value,[1,2,3]);
    assert.deepEqual(byName['KismetMathLibrary.Add_Int64Int64'].value,{type:'bigint',value:'9007199254740995'});
    assert.deepEqual(byName.containers.value.array,[2,4,6]);
    assert.deepEqual(byName.containers.value.set,[1,'x']);
    assert.deepEqual(byName.containers.value.map,[1,7,null]); // JSON array undefined becomes null.
    assert.ok(byName.containers.value.arrayMethods.every(([,type])=>type==='function'));
    assert.deepEqual(byName.nativeClass.value.slice(0,3),['Actor','PBZGameInstance','undefined']);
    assert.equal(byName.softClass.value.get,'function'); assert.equal(byName.softClass.value.load,'function');
    assert.equal(typeof byName.softClass.value.text,'string');
    assert.match(byName.blueprint.value.path,/^\/Game\/.*\.BP_PlayerController_C$/);
    assert.equal(byName.blueprint.value.name,byName.blueprint.value.staticClass);
    assert.equal(byName.blueprint.value.castAvailable,'undefined');
    assert.match(byName.blueprint.value.instance,/^BP_PlayerController_C_/);
    assert.deepEqual(byName.enum.value,[1,2,3]);
    assert.ok(byName.delegate.value.every(([,type])=>type==='function'));
}
assert.doesNotMatch(source,/generated-api-probe aborted|\[PBZMOD\] failed |log-overflow/);
const report={passed:true,maps,display:{width:1280,height:720,mode:'windowed'},checks:rows.length,callVerified:['Vector.constructor','KismetMathLibrary.BreakVector','KismetMathLibrary.Add_Int64Int64','containers','nativeClass','softClass','blueprint','enum'],bindingOnly:['delegate'],excluded:['native and blueprint Cast'],probe:'tests/generated-api-probe.js',observations:rows};
fs.writeFileSync(path.join(path.dirname(log),'api-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,maps,checks:rows.length}));
