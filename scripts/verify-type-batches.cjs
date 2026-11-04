'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function verify(archive,sdk,out) {
    const read=f=>JSON.parse(fs.readFileSync(f));
    const batches=read(path.join(archive,'batches.json'));
    const before=read(path.join(archive,'type-index-before.json'));
    const oldReport=read(path.join(archive,'generation-report-before.json'));
    const index=read(path.join(sdk,'type-index.json')),report=read(path.join(sdk,'generation-report.json'));
    const outcomes=[], captures=[];
    for(const b of batches) {
        const cp=read(path.join(archive,'checkpoints',b.label+'.json'));
        if(cp.sequence!==b.sequence||cp.loadedNotCaptured.length||cp.results.length!==b.paths.length||
            new Set(cp.results.map(r=>r.path)).size!==b.paths.length||b.paths.some(p=>!cp.results.some(r=>r.path===p)))throw Error('Invalid checkpoint '+b.label);
        const file=path.join(cp.capture,'reflection.json'),bytes=fs.readFileSync(file);
        const name=path.basename(cp.capture)+'/reflection.json',hash=crypto.createHash('sha256').update(bytes).digest('hex');
        if(!report.captures.some(c=>c.name===name&&c.sha256===hash))throw Error('SDK omitted/changed capture: '+name);
        const windows=['-window.json','-window-after.json'].map(s=>read(path.join(archive,'checkpoints',b.label+s)));
        if(windows.some(w=>w.valid!==true||w.clientWidth!==1280||w.clientHeight!==720))throw Error('Invalid batch window evidence');
        outcomes.push(...cp.results);captures.push({name,sha256:hash});
    }
    if(new Set(outcomes.map(r=>r.path)).size!==outcomes.length)throw Error('Duplicate targets across batches');
    const missing=outcomes.filter(r=>r.event==='loaded'&&!Object.hasOwn(index,r.path));
    const removed=Object.keys(before).filter(p=>!Object.hasOwn(index,p));
    if(missing.length||removed.length)throw Error('SDK lost types: '+JSON.stringify({missing,removed}));
    const failed=outcomes.filter(r=>r.event==='failed'),added=Object.keys(index).filter(p=>!Object.hasOwn(before,p));
    const namespaces={};
    for(const r of outcomes){const ns=r.path.split('/')[1];const n=namespaces[ns]||={requested:0,loaded:0,failed:0};n.requested++;n[r.event==='loaded'?'loaded':'failed']++;}
    const delta=Object.fromEntries(Object.entries(report.counts).filter(([,v])=>typeof v==='number').map(([k,v])=>[k,v-(oldReport.counts[k]||0)]));
    const result={schemaVersion:1,batches:batches.length,requested:outcomes.length,loaded:outcomes.length-failed.length,failed,
        comparisonBaseline:{build:oldReport.build,counts:oldReport.counts,index:'type-index-before.json'},
        missingLoadedTypes:missing,removedOldTypes:removed,addedTypes:added.length,namespaces,counts:report.counts,delta,captures,
        sdkVersion:read(path.join(sdk,'package.json')).version,
        scope:'Loaded type definitions and reflected signatures; not individual gameplay-call verification.'};
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2)+'\n');
    fs.writeFileSync(path.join(out,'added-type-paths.json'),JSON.stringify(added,null,2)+'\n');
    fs.writeFileSync(path.join(out,'remaining-load-targets.json'),JSON.stringify(failed,null,2)+'\n');
    const md=['# 分批加载与 SDK 合并报告','',
        `共 ${result.batches} 批、${result.requested} 个目标，加载成功 ${result.loaded}，失败 ${failed.length}。`,
        `SDK ${result.sdkVersion} 相对输入基线新增 ${added.length} 个类型（含依赖），保留全部基线类型；基线构建为 ${oldReport.build}。`, '',
        '| 目录 | 请求 | 成功 | 失败 |','| --- | ---: | ---: | ---: |',
        ...Object.entries(namespaces).sort((a,b)=>b[1].requested-a[1].requested).map(([k,v])=>`| ${k} | ${v.requested} | ${v.loaded} | ${v.failed} |`),'',
        '| 声明项 | 合并后 | 新增 |','| --- | ---: | ---: |',
        ...['types','classes','structs','enums','functions','properties'].map(k=>`| ${k} | ${report.counts[k]} | ${delta[k]} |`),'',
        '## 未解决目标','',
        ...(failed.length?failed.map(r=>'- `'+r.path+'`：'+r.error):['无。']), '',
        '## 验证范围','',
        '- 每批加载结果完整，成功加载的类型均出现在反射清单与合并后 SDK 中。',
        '- SDK 记录的原始采集 SHA256 与本地文件一致；未丢失旧 SDK 类型。',
        '- 每批采集前后确认客户区 1280×720、普通窗口。',
        '- 函数与属性签名来自反射；未逐个执行游戏逻辑，不能视为全部可调用性保证。',
        '- 未解析属性、内部函数排除和 FName 大小写差异详见 SDK generation-report.json。',
        '- 具体新增路径见 added-type-paths.json；所有批次与计数见 verification.json。',''];
    fs.writeFileSync(path.join(out,'report.md'),md.join('\n'));
    console.log(JSON.stringify({batches:result.batches,requested:result.requested,loaded:result.loaded,failed:failed.length,addedTypes:added.length,delta},null,2));
}
if(require.main===module){try{if(process.argv.length!==5)throw Error('Usage: node scripts/verify-type-batches.cjs <archive> <sdk> <new-output-dir>');verify(...process.argv.slice(2));}catch(e){console.error(e.stack);process.exitCode=1;}}
