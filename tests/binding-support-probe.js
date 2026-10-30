'use strict';
// Development-only, command-gated probe. Publish commands only after native
// window validation. Each native operation has a before/after breadcrumb.
const UE=require('ue'), puerts=require('puerts');
let sequence=1, held=[];
function emit(row) { console.log('[PBZMOD] binding-support '+JSON.stringify(row)); }
function describe(v) { return {type:typeof v,value:typeof v==='bigint'?String(v):v===null||['number','string','boolean'].includes(typeof v)?v:undefined}; }
function step(name,run) {
    emit({event:'before',sequence,step:name});
    const result=run();
    emit({event:'after',sequence,step:name,result});
    return result;
}
const timer=setInterval(()=>{
    if(!puerts.argv.getByName('GameInstance'))return;
    let command;try{command=require('./commands/'+String(sequence).padStart(4,'0'));}catch(_){return;}
    try {
        const s=UE.GameUserSettings.GetGameUserSettings(),v=s.GetScreenResolution();
        if(v.X!==1280||v.Y!==720||s.GetFullscreenMode()!==2)throw Error('Require 1280x720 windowed');
        emit({event:'begin',sequence,label:command.label,display:{width:v.X,height:v.Y,mode:2}});
        command.run({UE,puerts,step,describe,hold:v=>{held.push(v);return v;}});
        emit({event:'end',sequence});
    }catch(e){emit({event:'error',sequence,error:String(e.stack||e)});}
    sequence++;
},250);
exports.stop=()=>{clearInterval(timer);held=[];};
