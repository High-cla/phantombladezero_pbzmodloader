'use strict';
// Developer-only, command-driven loading. No instances, gameplay calls, or saves.
const UE = require('ue'), puerts = require('puerts');
let sequence = 1, ticks = 0, job, cursor = 0, held = [], ready = false, eventId = 0;
const run = String(Date.now());
function log(value) {
    const text = JSON.stringify(value), id = eventId++;
    for (let at=0; at<text.length; at+=300) console.log('[PBZMOD] load-types '+JSON.stringify({run,id,part:at/300,parts:Math.ceil(text.length/300),text:text.slice(at,at+300)}));
}
function checkDisplay() {
    const settings=UE.GameUserSettings.GetGameUserSettings(), size=settings.GetScreenResolution();
    if(size.X!==1280 || size.Y!==720 || settings.GetFullscreenMode()!==2) throw Error('Require 1280x720 windowed');
}
const timer=setInterval(()=>{
    try {
        if(!ready) {
            if(++ticks<300 || !puerts.argv.getByName('GameInstance')) return;
            checkDisplay(); ready=true; log({event:'ready'});
        }
        if(!job) {
            let command;
            try {command=require('./commands/'+String(sequence).padStart(4,'0'));} catch (_) {return;}
            if(command.sequence!==sequence || !Array.isArray(command.paths) || command.paths.length>512 ||
                command.paths.some(p=>typeof p!=='string'||!/^\/[^\s']+\.[^\s']+$/.test(p))) throw Error('Invalid load command');
            checkDisplay(); job=command; held=[]; cursor=0;
            log({event:'begin',sequence,count:job.paths.length});
        }
        checkDisplay();
        const start=Date.now();
        // Bound synchronous work between frames. A single asset load may take longer.
        for(let i=0;i<8 && cursor<job.paths.length && Date.now()-start<30;i++) {
            const path=job.paths[cursor++];
            try {
                const object=UE.Object.Load(path);
                if(!object) throw Error('Object.Load returned null');
                const actual=UE.KismetSystemLibrary.GetPathName(object);
                if(actual!==path) throw Error('Loaded path mismatch: '+actual);
                held.push(object);
                log({event:'loaded',sequence,path,metaclass:object.GetClass().GetName()});
            } catch(e) {log({event:'failed',sequence,path,error:String(e)});}
        }
        if(cursor===job.paths.length) {
            log({event:'done',sequence,count:cursor,retained:held.length});
            sequence++; job=undefined;
            // Objects remain referenced while the external read-only exporter runs.
        }
    } catch(e) {
        log({event:'fatal',sequence,error:String(e && e.stack || e)}); clearInterval(timer);
    }
},100);
exports.stop=()=>{clearInterval(timer);held=[];job=undefined;};
