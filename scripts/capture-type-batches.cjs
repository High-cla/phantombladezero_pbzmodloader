'use strict';
// Controller: one acknowledged batch at a time; never loads while exporting.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function events(log) {
    const records=new Map();
    for(const line of log.split(/\r?\n/)) {
        const marker='[PBZMOD] load-types ',at=line.indexOf(marker); if(at<0) continue;
        let frame; try{frame=JSON.parse(line.slice(at+marker.length));}catch{continue;} // concurrent trailing write
        const key=frame.run+':'+frame.id;
        if(!records.has(key)) records.set(key,{parts:frame.parts,chunks:new Map()});
        const r=records.get(key);
        if(r.chunks.has(frame.part)) throw Error('Duplicate load event frame');
        r.chunks.set(frame.part,frame.text);
    }
    return [...records.values()].filter(r=>r.chunks.size===r.parts).map(r=>JSON.parse(Array.from({length:r.parts},(_,i)=>r.chunks.get(i)).join('')));
}
function execute(exe,args,out) {
    return new Promise((resolve,reject)=>{
        const child=cp.spawn(exe,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let text='';
        child.stdout.on('data',b=>text+=b);child.stderr.on('data',b=>text+=b);
        child.on('error',reject);child.on('close',code=>{if(out)fs.writeFileSync(out,text);resolve({code,text});});
    });
}
async function main(configFile) {
    const c=JSON.parse(fs.readFileSync(configFile)), batches=JSON.parse(fs.readFileSync(c.batches));
    fs.mkdirSync(c.commandDir,{recursive:true});fs.mkdirSync(c.archive,{recursive:true});
    for(const batch of batches) {
        const seq=batch.sequence,label=batch.label;
        const checkpoint=path.join(c.archive,label+'.json');
        if(fs.existsSync(checkpoint)) {
            const previous=JSON.parse(fs.readFileSync(checkpoint));
            if(previous.loadedNotCaptured.length)throw Error('Unresolved checkpoint: '+label);
            continue;
        }
        const before=await execute('powershell.exe',['-NoProfile','-File','scripts/PBZ-Windowed.ps1','-Status'],path.join(c.archive,label+'-window.json'));
        if(before.code!==0) throw Error('Window check failed: '+before.text);
        const state=JSON.parse(before.text);if(state.processId!==c.pid)throw Error('Process changed');
        const command=path.join(c.commandDir,String(seq).padStart(4,'0')+'.js');
        if(!fs.existsSync(command)) {fs.writeFileSync(command+'.tmp','module.exports='+JSON.stringify(batch)+';\n');fs.renameSync(command+'.tmp',command);}
        const deadline=Date.now()+15*60*1000;
        let rows;
        while(true) {
            rows=events(fs.readFileSync(c.log,'utf8'));
            const fatal=rows.find(e=>e.event==='fatal');if(fatal)throw Error(JSON.stringify(fatal));
            if(rows.some(e=>e.event==='done'&&e.sequence===seq))break;
            if(Date.now()>deadline)throw Error('Batch timeout: '+label);
            await delay(1000);
        }
        const results=rows.filter(e=>e.sequence===seq&&['loaded','failed'].includes(e.event));
        if(results.length!==batch.paths.length || new Set(results.map(e=>e.path)).size!==batch.paths.length ||
            batch.paths.some(p=>!results.some(r=>r.path===p))) throw Error('Missing/duplicate load outcomes: '+label);
        await delay(4000);
        let captured;
        for(let attempt=1;attempt<=3;attempt++) {
            const folder=path.join(c.reflectionRoot,label+(attempt>1?'-retry'+attempt:''));
            if(fs.existsSync(folder)) continue;
            const result=await execute(c.python,['scripts/reflection_export.py','--pid',String(c.pid),'--label',label,'--output',folder],path.join(c.archive,label+'-export-'+attempt+'.log'));
            if((result.code===0||result.code===2)&&fs.existsSync(path.join(folder,'reflection.json'))) {captured=folder;break;}
            await delay(5000);
        }
        if(!captured)throw Error('Capture failed: '+label);
        const after=await execute('powershell.exe',['-NoProfile','-File','scripts/PBZ-Windowed.ps1','-Status'],path.join(c.archive,label+'-window-after.json'));
        if(after.code!==0)throw Error('Window check after capture failed');
        const raw=JSON.parse(fs.readFileSync(path.join(captured,'reflection.json'))), capturedPaths=new Set(raw.records.filter(r=>!r.unresolved).map(r=>r.path));
        const missing=results.filter(r=>r.event==='loaded'&&!capturedPaths.has(r.path));
        fs.writeFileSync(checkpoint,JSON.stringify({label,sequence:seq,capture:captured,results,loadedNotCaptured:missing},null,2)+'\n');
        console.log(JSON.stringify({label,requested:batch.paths.length,loaded:results.filter(r=>r.event==='loaded').length,loadedNotCaptured:missing.length,records:raw.records.length}));
        if(missing.length)throw Error('Loaded types missing in reflection; keep checkpoint for investigation');
    }
}
module.exports={events};
if(require.main===module)main(process.argv[2]).catch(e=>{console.error(e.stack);process.exitCode=1;});
