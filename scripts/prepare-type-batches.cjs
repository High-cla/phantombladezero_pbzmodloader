'use strict';
const fs=require('node:fs');
function prepare(coverage, size=512, prefix='loaded') {
    if(!Number.isInteger(size)||size<1||size>512)throw Error('Batch size must be 1..512');
    const priorities=['PBZCombatAsset','Game','HuaShira'], pilot=[];
    for(const ns of priorities)for(const kind of ['UserDefinedStruct','UserDefinedEnum','LegoAbilityBlueprintGeneratedClass','BlueprintGeneratedClass']) {
        const a=coverage.assets.find(a=>a.status==='not-in-sdk'&&a.typePath?.startsWith('/'+ns+'/')&&a.classPath.endsWith('.'+kind));
        if(a&&!pilot.includes(a.typePath))pilot.push(a.typePath);
    }
    const batches=[],used=new Set();
    function append(paths,label) {
        for(let i=0;i<paths.length;i+=size) {
            const sequence=batches.length+1,chunk=paths.slice(i,i+size);chunk.forEach(p=>used.add(p));
            batches.push({sequence,label:prefix+'-'+String(sequence).padStart(3,'0')+'-'+label,paths:chunk});
        }
    }
    append(pilot,'pilot');
    for(const ns of [...priorities,'remaining']) {
        const paths=coverage.types.filter(t=>t.status==='not-in-sdk'&&!used.has(t.typePath)&&
            (ns==='remaining'?!priorities.includes(t.typePath.split('/')[1]):t.typePath.startsWith('/'+ns+'/'))).map(t=>t.typePath);
        append(paths,ns);
    }
    return batches;
}
module.exports={prepare};
if(require.main===module) {
    const [input,out,prefix='loaded']=process.argv.slice(2);
    if(!input||!out)throw Error('Usage: node scripts/prepare-type-batches.cjs <asset-coverage.json> <new-batches.json> [label-prefix]');
    fs.writeFileSync(out,JSON.stringify(prepare(JSON.parse(fs.readFileSync(input)),512,prefix),null,2)+'\n',{flag:'wx'});
}
