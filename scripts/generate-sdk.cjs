'use strict';
// Offline reflection -> PuerTS declarations. No game process or network access.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const quote = JSON.stringify;
const keywords = new Set('any unknown never void number string boolean bigint symbol object type interface class function var let const new default delete extends implements import export enum namespace public private protected static package yield await null undefined true false this super return in instanceof'.split(' '));
const identifier = s => /^[A-Za-z_$][\w$]*$/.test(s) && !keywords.has(s);
const safe = s => (identifier(s) ? s : '_' + s.replace(/[^\w$]/g, '_'));
const ephemeral = r => /\/(?:Temp|Transient)\//.test(r.path) || r.path.startsWith('/Engine/Transient.') || /^(SKEL_|REINST_|TRASHCLASS_|HOTRELOADED_|PLACEHOLDER-)/.test(r.name);
const captureChecks = ['vector','actorInheritance','playerPawnSignature','axisEnum','objectArrayStable','reflectionIdentitiesStable'];

function parseReflection(bytes) {
    return JSON.parse(bytes,(key,value,context) => {
        if (typeof value !== 'number' || Number.isSafeInteger(value)) return value;
        if (!context?.source) throw Error('Lossless JSON parsing requires JSON.parse reviver source support; use Node.js 24+');
        return context.source;
    });
}

// Remove capture-specific identity/layout diagnostics; compare public schema, not addresses.
function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().filter(k => !['objectIndex','objectFlags','address','rawHeaderHex','error'].includes(k) && !(value.unresolved && ['offset','elementSize','arrayDim'].includes(k))).map(k => [k, canonical(value[k])]));
    }
    return value;
}

function generate(inputs, supplemental) {
    const records = new Map(), origins = new Map();
    const report = {schemaVersion:1, generatorVersion:1, captures:[], conflicts:[], implementationChanges:[], excludedTypes:[], omittedMembers:[], omittedEnumValues:[], unresolvedProperties:[], ignoredLocals:0, nameCollisions:[], inheritanceOverrides:[], counts:{}};
    let build, exeSha256;
    for (const {name, data, sha256} of inputs.slice().sort((a,b) => a.name.localeCompare(b.name, 'en'))) {
        const m = data.manifest;
        if (m?.schemaVersion !== 1 || !Array.isArray(data.records) || !m.build || !m.exeSha256) throw Error('Invalid reflection input: ' + name);
        if (build && (build !== m.build || exeSha256 !== m.exeSha256)) throw Error('Cannot merge different game builds');
        if (!m.checks || captureChecks.some(k => m.checks[k] !== true) || Object.values(m.checks).some(v => v !== true)) throw Error('Capture validation failed: ' + name);
        build = m.build; exeSha256 = m.exeSha256;
        report.captures.push({name, sha256, label:m.label, capturedAt:m.capturedAt, records:data.records.length});
        const local = new Set();
        for (const r of data.records) {
            if (!r.path || local.has(r.path)) throw Error('Duplicate/missing record path in ' + name + ': ' + r.path);
            local.add(r.path);
            // Function locals are not part of the public API or cross-capture conflicts.
            const normalized = canonical({...r, ...(r.kind === 'Function' ? {properties:r.properties?.filter(p => p.parameter)} : {})});
            // PuerTS mixin installation adds implementation aliases and flips FUNC_Native.
            // Neither changes the original function's public signature. Record this separately.
            if (normalized.functions) normalized.functions=normalized.functions.filter(p=>!p.endsWith('__puerts_mixin__')).sort();
            if (normalized.kind==='Function') {delete normalized.native; normalized.functionFlags='0x'+(BigInt(normalized.functionFlags || 0) & ~0x400n).toString(16);}
            if (r.kind === 'Function') report.ignoredLocals += (r.properties || []).filter(p => !p.parameter).length;
            const old = records.get(r.path);
            if (old?.kind==='Class' && quote(old.functions)!==quote(normalized.functions) && quote({...old,functions:[]})===quote({...normalized,functions:[]})) {
                report.implementationChanges.push({path:r.path,reason:'union of class functions across captures',sources:[origins.get(r.path),name],added:(normalized.functions||[]).filter(p=>!old.functions.includes(p))});
                normalized.functions=[...new Set([...old.functions,...normalized.functions])].sort();
                old.functions=normalized.functions;
            }
            if (old && quote(old) !== quote(normalized)) report.conflicts.push({path:r.path, sources:[origins.get(r.path),name]});
            else { records.set(r.path, normalized); origins.set(r.path, name); }
            if (r.name.endsWith('__puerts_mixin__')) report.implementationChanges.push({path:r.path,reason:'PuerTS runtime mixin alias excluded from API'});
        }
    }
    if (report.conflicts.length) throw Error('Conflicting definitions: ' + quote(report.conflicts.slice(0,20)));
    report.build = build; report.exeSha256 = exeSha256;
    const all = [...records.values()].sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const types = all.filter(r => r.kind !== 'Function' && !ephemeral(r) && !r.unresolved);
    const excluded = new Set(all.filter(r => r.kind !== 'Function' && (ephemeral(r) || r.unresolved)).map(r => r.path));
    report.excludedTypes = [...excluded].map(p => ({path:p,reason:ephemeral(records.get(p)) ? 'temporary-runtime-type' : 'unresolved-record'}));
    const names = new Map(), symbols = new Map(), staticSymbols = new Map();
    for (const r of types.filter(r => r.source === 'native')) names.set(r.name, (names.get(r.name) || 0)+1);
    for (const r of types) {
        const direct = r.source === 'native' && identifier(r.name) && names.get(r.name) === 1;
        const id = direct ? r.name : safe(r.name) + '_' + hash(r.path).slice(0,12);
        symbols.set(r.path, direct ? id : '$Blueprint.' + id);
        staticSymbols.set(r.path, id);
        if (r.source === 'native' && !direct) report.nameCollisions.push({path:r.path, symbol:'$Blueprint.'+id, reason:'not exposed as a guessed runtime identifier'});
    }
    const missing = new Set();
    function ref(p, allowed) {
        if (symbols.has(p) && (!allowed || allowed.includes(records.get(p).kind))) return 'UE.' + symbols.get(p);
        missing.add(p || '<null>');
        throw Error('unavailable type reference: ' + p);
    }
    function mapped(p, stack = new Set()) {
        if (!p || p.unresolved) throw Error('unresolved reflection property');
        let t;
        switch (p.kind) {
        case 'BoolProperty': t='boolean'; break;
        case 'Int8Property': case 'Int16Property': case 'IntProperty': case 'UInt16Property': case 'UInt32Property': case 'FloatProperty': case 'DoubleProperty': t='number'; break;
        case 'Int64Property': case 'UInt64Property': t='bigint'; break;
        case 'NameProperty': case 'StrProperty': case 'TextProperty': t='string'; break;
        case 'ByteProperty': t=p.enum ? ref(p.enum,['Enum']) : 'number'; break;
        case 'EnumProperty': t=ref(p.enum,['Enum']); break;
        case 'StructProperty': t=['/Script/JsEnv.ArrayBuffer','/Script/JsEnv.ArrayBufferValue'].includes(p.target) ? 'ArrayBuffer' : p.target === '/Script/JsEnv.JsObject' ? 'object' : ref(p.target,['ScriptStruct']); break;
        case 'ClassProperty': t='UE.Class | null | undefined'; break;
        case 'ObjectProperty': case 'InterfaceProperty': case 'WeakObjectProperty': case 'LazyObjectProperty': t=ref(p.target,['Class'])+' | null | undefined'; break;
        case 'SoftObjectProperty': t='UE.TSoftObjectPtr<'+ref(p.target,['Class'])+'>'; break;
        case 'SoftClassProperty': t='UE.TSoftClassPtr<'+ref(p.metaClass,['Class'])+'>'; break;
        case 'ArrayProperty': t='UE.TArray<'+mapped(p.inner,stack)+'>'; break;
        case 'SetProperty': t='UE.TSet<'+mapped(p.inner,stack)+'>'; break;
        case 'MapProperty': t='UE.TMap<'+mapped(p.key,stack)+', '+mapped(p.value,stack)+'>'; break;
        case 'DelegateProperty': case 'MulticastDelegateProperty': case 'MulticastInlineDelegateProperty': case 'MulticastSparseDelegateProperty': {
            if (stack.has(p.target)) throw Error('recursive delegate signature');
            const next=new Set(stack); next.add(p.target);
            const f=records.get(p.target);
            if (f?.kind !== 'Function') throw Error('missing delegate signature: '+p.target);
            t='UE.'+(p.kind === 'DelegateProperty' ? '$Delegate' : '$MulticastDelegate')+'<'+signature(f,true,next)+'>'; break;
        }
        default: throw Error('unverified PuerTS mapping: '+p.kind);
        }
        return p.arrayDim > 1 ? 'UE.FixSizeArray<'+t+'>' : t;
    }
    function signature(f, arrow=false, stack=new Set()) {
        if (f.unresolved || !Array.isArray(f.properties)) throw Error('unresolved function');
        const ps=f.properties.filter(p=>p.parameter), ret=ps.filter(p=>p.return);
        if (ret.length > 1 || ps.length !== f.parameterCount) throw Error('invalid function parameters');
        const used=new Set();
        const args=ps.filter(p=>!p.return).map((p,i)=>{
            let name=safe(p.name); while (used.has(name)) name += '_'+i; used.add(name);
            let t=mapped(p,stack);
            if (p.out && !p.const) t='$Ref<'+t+'>';
            return name+': '+t;
        });
        return '('+args.join(', ')+')'+(arrow?' => ':': ')+(ret.length?mapped(ret[0],stack):'void');
    }
    const manual = supplemental.modules.ue;
    const manualHas = (r,n) => r.source === 'native' && manual[r.name]?.includes(n);
    const files = new Map(), index = {}, stats = {types:types.length, nativeTypes:0, assetTypes:0, classes:0, structs:0, enums:0, functions:0, properties:0, enumValues:0, manualMembers:0};
    const grouped = new Map();
    for (const r of types) {
        const group=r.source === 'native' ? r.path.split('.')[0].slice('/Script/'.length) : 'blueprints';
        if (!grouped.has(group)) grouped.set(group, []);
        grouped.get(group).push(r);
    }
    const memberNames = new Map();
    function inheritedNames(r, stack=new Set()) {
        if (memberNames.has(r.path)) return memberNames.get(r.path);
        if (stack.has(r.path)) throw Error('Inheritance cycle: '+r.path);
        stack.add(r.path);
        const names=new Set(r.super && symbols.has(r.super) ? inheritedNames(records.get(r.super),stack) : []);
        for (const p of r.properties || []) names.add(p.name);
        for (const f of r.functions || []) if (records.get(f) && !records.get(f).static) names.add(records.get(f).name);
        for (const n of manual[r.name] || []) names.add(n);
        memberNames.set(r.path,names); return names;
    }
    for (const [group, groupTypes] of grouped) {
        const lines=["// Generated by scripts/generate-sdk.cjs. Do not edit. See generation-report.json.", "declare module 'ue' {", "    import * as UE from 'ue';", "    import { $Ref } from 'puerts';"];
        for (const r of groupTypes) {
            const sym=symbols.get(r.path), sid=staticSymbols.get(r.path), nested=sym.includes('.'), id=nested?sym.split('.')[1]:sym;
            stats[r.source === 'native' ? 'nativeTypes' : 'assetTypes']++;
            index[r.path]={kind:r.kind,symbol:'ue.'+sym,file:'types/generated/'+group+'.d.ts',status:'reflection-generated',runtimeAccess:r.source==='native'&&!nested ? 'ue.'+r.name : 'type-only; use reflected path and Class.Load/blueprint.tojs for classes'};
            if (nested) lines.push('    namespace $Blueprint {');
            lines.push('    /** '+r.path.replace(/\*\//g,'* /')+' — reflection-generated, not individually call-tested. */');
            if (r.kind === 'Enum') {
                stats.enums++; const values=[], entries=[];
                for (const v of r.values || []) {
                    if (!Number.isSafeInteger(v.value)) {report.omittedEnumValues.push({path:r.path,member:v.name,value:v.value,reason:'enum value outside safe JS integer range; runtime enum representation unverified'});continue;}
                    entries.push(v);
                    values.push(v.value); stats.enumValues++;
                }
                // Blueprint enums are type-only: avoid claiming a runtime namespace exists.
                if (nested) lines.push('    type '+id+' = '+([...new Set(values)].join(' | ')||'never')+';');
                else {
                    lines.push('    enum '+id+' {');
                    for (const v of entries) lines.push('        '+quote(v.name.split('::').pop())+' = '+v.value+',');
                    lines.push('    }');
                }
            } else {
                stats[r.kind==='Class'?'classes':'structs']++;
                const props=[], methods=[], statics=[], own=[];
                for (const p of r.properties || []) {
                    if (manualHas(r,p.name)) {stats.manualMembers++;continue;}
                    own.push(p.name);
                    try { props.push('        '+quote(p.name)+': '+mapped(p)+';'); stats.properties++; }
                    catch(e) {
                        report.unresolvedProperties.push({owner:r.path,member:p.name,kind:p.kind,reflectionUnresolved:!!p.unresolved,reason:e.message});
                        props.push('        /** Unresolved; see generation-report.json. */');
                        props.push('        readonly '+quote(p.name)+': UE.$Unresolved<'+quote(r.path+'.'+p.name)+'>;');
                    }
                }
                for (const fp of r.functions || []) {
                    const f=records.get(fp);
                    if (!f || f.kind !== 'Function') throw Error('Missing class function: '+fp);
                    if (f.name.startsWith('ExecuteUbergraph_') || f.name.endsWith('__DelegateSignature')) {
                        report.omittedMembers.push({path:fp,reason:'internal blueprint entry point or delegate signature'});continue;
                    }
                    if (manualHas(r,f.name)) {stats.manualMembers++;continue;}
                    if (!f.static) own.push(f.name);
                    try {
                        const decl='        '+quote(f.name)+signature(f)+';';
                        (f.static?statics:methods).push(decl); stats.functions++;
                    } catch(e) {report.omittedMembers.push({path:fp,reason:e.message});}
                }
                let base='';
                if (r.super) {
                    const parent=ref(r.super,['Class','ScriptStruct']);
                    const inherited=inheritedNames(records.get(r.super));
                    const overlap=[...new Set(own)].filter(n=>inherited.has(n));
                    // Blueprint overrides can legally change signatures. Preserve the actual child
                    // signature instead of inventing overloads just to satisfy TS inheritance.
                    base=' extends '+(overlap.length ? 'Omit<'+parent+', '+overlap.map(quote).join(' | ')+'>' : parent);
                    if (overlap.length) report.inheritanceOverrides.push({path:r.path,members:overlap});
                }
                lines.push('    interface '+id+base+' {',...props,...methods,'    }');
                if (nested) lines.push('    }');
                lines.push('    namespace $Static {','    interface '+sid+' {',...statics,'    }','    }');
                if (!nested) lines.push('    const '+id+': UE.$Static.'+sid+' & UE.'+(r.kind==='Class'?'$ClassType':'$StructType')+'<UE.'+sym+'>;');
                if (nested) continue;
            }
            if (nested) lines.push('    }');
        }
        lines.push('}');
        files.set(group+'.d.ts',lines.join('\n')+'\n');
    }
    const paths=["// Generated path lookup. These interfaces have no runtime value.","declare module 'ue' {","    import * as UE from 'ue';",'    interface ReflectedTypes {'];
    for(const r of types) paths.push('        '+quote(r.path)+': UE.'+symbols.get(r.path)+';');
    paths.push('    }','    interface ReflectedClasses {');
    for(const r of types.filter(r=>r.kind==='Class')) paths.push('        '+quote(r.path)+': UE.'+symbols.get(r.path)+';');
    paths.push('    }','    interface ReflectedClassStatics {');
    for(const r of types.filter(r=>r.kind==='Class')) paths.push('        '+quote(r.path)+': UE.$Static.'+staticSymbols.get(r.path)+';');
    paths.push('    }','}'); files.set('paths.d.ts',paths.join('\n')+'\n');
    report.counts={...stats, uniqueRecords:records.size, excludedTypes:report.excludedTypes.length, omittedMembers:report.omittedMembers.length, unresolvedProperties:report.unresolvedProperties.length};
    report.missingReferences=[...missing].sort();
    // A dangling capture reference is a corrupt graph; a known excluded type is reported.
    if ([...missing].some(p=>!excluded.has(p))) throw Error('Dangling type references: '+quote([...missing]));
    report.scope='Union of validated captures; no unloaded-asset coverage or universal runtime-callability claim.';
    return {files,index,report};
}

function main(args) {
    let out=path.join(root,'sdk'); const input=[];
    for(let i=0;i<args.length;i++) {
        if(args[i]==='--out') {if(!args[i+1]) throw Error('--out requires a directory');out=path.resolve(args[++i]);}
        else input.push(path.resolve(args[i]));
    }
    if(!input.length) throw Error('Usage: npm run sdk:generate -- <reflection.json> [<reflection.json> ...] [--out <sdk directory>]');
    const supplemental=JSON.parse(fs.readFileSync(path.join(root,'scripts/sdk-supplemental.json'),'utf8'));
    const result=generate(input.map(file=>{const bytes=fs.readFileSync(file);return {name:path.basename(path.dirname(file))+'/'+path.basename(file),sha256:hash(bytes),data:parseReflection(bytes)};}),supplemental);
    const generated=path.join(out,'types/generated');
    fs.mkdirSync(generated,{recursive:true});
    // Only replace files owned by this generator; do not recursively delete arbitrary --out.
    for(const f of fs.readdirSync(generated)) {
        const target=path.join(generated,f);
        if(!f.endsWith('.d.ts') || fs.lstatSync(target).isSymbolicLink() || !fs.readFileSync(target,'utf8').startsWith('// Generated')) throw Error('Unmanaged generated file: '+target);
    }
    for(const f of fs.readdirSync(generated)) if(!result.files.has(f)) fs.unlinkSync(path.join(generated,f));
    for(const [file,contents] of result.files) fs.writeFileSync(path.join(generated,file),contents);
    fs.writeFileSync(path.join(out,'types/generated.d.ts'),[...result.files.keys()].sort().map(f=>'/// <reference path="generated/'+f+'" />').join('\n')+'\n');
    fs.writeFileSync(path.join(out,'type-index.json'),JSON.stringify(result.index,null,2)+'\n');
    fs.writeFileSync(path.join(out,'generation-report.json'),JSON.stringify(result.report,null,2)+'\n');
    console.log(JSON.stringify(result.report.counts,null,2));
}
module.exports={generate,canonical,parseReflection};
if(require.main===module) {try{main(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}}
