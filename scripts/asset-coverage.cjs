'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const marker = '[PBZMOD] asset-inventory ';
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function decode(log) {
    const runs = new Map();
    for (const line of log.split(/\r?\n/)) {
        const at = line.indexOf(marker);
        if (at < 0) continue;
        const frame = JSON.parse(line.slice(at + marker.length));
        if (typeof frame.run !== 'string' || !Number.isInteger(frame.id) || frame.id < 0 ||
            !Number.isInteger(frame.part) || !Number.isInteger(frame.parts) || frame.parts < 1 ||
            frame.part < 0 || frame.part >= frame.parts || typeof frame.text !== 'string') throw Error('Invalid frame');
        if (!runs.has(frame.run)) runs.set(frame.run, new Map());
        const records = runs.get(frame.run);
        if (!records.has(frame.id)) records.set(frame.id, {parts: frame.parts, chunks: new Map()});
        const record = records.get(frame.id);
        if (record.parts !== frame.parts || record.chunks.has(frame.part)) throw Error('Duplicate/conflicting frame');
        record.chunks.set(frame.part, frame.text);
    }
    if (runs.size !== 1) throw Error('Expected exactly one capture run per log');
    const [run, records] = [...runs][0], rows = [];
    for (let id = 0; id < records.size; id++) {
        const r = records.get(id);
        if (!r || r.chunks.size !== r.parts) throw Error('Missing record/frame: ' + id);
        rows.push(JSON.parse(Array.from({length:r.parts}, (_,i) => r.chunks.get(i)).join('')));
    }
    const begin = rows[0], end = rows.at(-1), assets = rows.slice(1,-1);
    const failure = rows.find(r => r.event === 'error');
    if (failure) throw Error('Probe failed: ' + failure.message);
    if (begin?.event !== 'begin' || end?.event !== 'end' || begin.schemaVersion !== 1) throw Error('Incomplete capture');
    if (JSON.stringify(begin.display) !== JSON.stringify({width:1280,height:720,mode:2})) throw Error('Invalid display');
    if (assets.some(a => a.event !== 'asset') || new Set(assets.map(a=>a.path)).size !== assets.length) throw Error('Invalid/duplicate asset rows');
    if (begin.totalAssets !== end.totalAssets || Object.values(end.classes).reduce((a,b)=>a+b,0) !== end.totalAssets) throw Error('Asset count mismatch');
    const expected = Object.entries(end.classes).filter(([k])=>/Blueprint|Class|Struct|Enum/.test(k.split('.').at(-1))).reduce((n,[,v])=>n+v,0);
    if (assets.length !== expected) throw Error('Missing asset rows');
    return {run, begin, end, assets};
}
function exportPath(value) {
    if (typeof value !== 'string') return null;
    const p = value.includes("'") ? value.slice(value.indexOf("'")+1, value.lastIndexOf("'")) : value;
    return /^\/[^\s']+\.[^\s']+$/.test(p) ? p : null;
}
function classify(asset) {
    const generated = exportPath(asset.tags.GeneratedClass) || exportPath(asset.tags.GeneratedClassPath);
    if (generated) return {typePath: generated, evidence: 'registry-generated-class-tag'};
    const cls = asset.classPath.split('.').at(-1);
    if (cls === 'Class' || cls.endsWith('GeneratedClass') || ['UserDefinedStruct','UserDefinedEnum','ScriptStruct','Enum'].includes(cls)) {
        return {typePath:asset.path, evidence:'registry-type-asset'};
    }
    // A naming convention is a discovery hint, never proof of an existing class.
    if (cls.endsWith('Blueprint')) return {typePath:asset.path+'_C', evidence:'inferred-blueprint-path'};
    return {typePath:null, evidence:'unclassified-type-like-asset'};
}
function coverage(capture, index) {
    const counts = {}, rows = capture.assets.map(a => {
        const type = classify(a), match = type.typePath && Object.hasOwn(index, type.typePath);
        const status = match ? 'covered' : !type.typePath ? 'unclassified' : type.evidence.startsWith('inferred') ? 'candidate-unverified' : 'not-in-sdk';
        counts[status] = (counts[status] || 0) + 1;
        return {...a, ...type, status};
    }).sort((a,b)=>a.path.localeCompare(b.path,'en'));
    const unique = new Map(), rank = {'covered':3,'not-in-sdk':2,'candidate-unverified':1};
    for (const a of rows.filter(a=>a.typePath)) {
        const old = unique.get(a.typePath);
        if (!old) unique.set(a.typePath,{typePath:a.typePath,status:a.status,evidence:a.evidence,assetPaths:[a.path]});
        else {
            old.assetPaths.push(a.path);
            if (rank[a.status] > rank[old.status]) {old.status=a.status;old.evidence=a.evidence;}
        }
    }
    const types = [...unique.values()].sort((a,b)=>a.typePath.localeCompare(b.typePath,'en')), typeCounts = {};
    for (const t of types) typeCounts[t.status] = (typeCounts[t.status] || 0) + 1;
    return {schemaVersion:1, run:capture.run, capture:capture.begin, totalRegistryAssets:capture.end.totalAssets,
        typeLikeAssets:rows.length, counts, uniqueTypePaths:types.length, typeCounts, types, assetClasses:capture.end.classes,
        scope:'Registry type candidates compared with SDK paths; loaded is asset state, not proof of reflection capture or callability.',
        assets:rows};
}
function markdown(report) {
    const counts = report.counts;
    const missing = report.assets.filter(a=>a.status==='not-in-sdk');
    const groups = {};
    for (const a of missing) groups[a.classPath] = (groups[a.classPath] || 0) + 1;
    return ['# 资产覆盖差异报告', '',
        `采集 run：${report.run}；地图：${report.capture.map || 'unknown'}。`, '',
        '| 项目 | 数量 |', '| --- | ---: |',
        `| 登记表中的磁盘资产 | ${report.totalRegistryAssets} |`,
        `| 类型候选资产 | ${report.typeLikeAssets} |`,
        `| SDK 已包含路径 | ${counts.covered || 0} |`,
        `| 登记表有依据、SDK 未包含 | ${counts['not-in-sdk'] || 0} |`,
        `| 按蓝图命名推测、尚待验证 | ${counts['candidate-unverified'] || 0} |`,
        `| 尚未分类的类型候选 | ${counts.unclassified || 0} |`, '',
        `去重后的类型路径：${report.uniqueTypePaths}；已覆盖 ${report.typeCounts.covered || 0}，登记表有依据但未覆盖 ${report.typeCounts['not-in-sdk'] || 0}，仅推测 ${report.typeCounts['candidate-unverified'] || 0}。`, '',
        '蓝图资产与其 GeneratedClass 可能各占一条资产记录，以上资产计数不能当作独立 API 类型数。后续加载队列已按类型路径去重。', '',
        '## 已确认未覆盖的类型资产类别', '', '| 资产类 | 数量 |', '| --- | ---: |',
        ...Object.entries(groups).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`| ${k} | ${v} |`), '',
        '## 未覆盖路径示例（最多 20 条）', '', ...missing.slice(0,20).map(a=>'- `'+a.typePath+'`'), '',
        '## 证据与范围', '',
        '- `asset-coverage.json`：完整类型候选路径、标签、加载状态及 SDK 对比结果。',
        '- `load-candidates.json`：后续加载队列，保留已确认路径与推测路径的区别。',
        '- `summary.json`：所有资产类别计数、采集信息和输入 SHA256。',
        '- 本次只查询登记表，没有主动加载资产。非类型资产仅统计类别，不逐条导出。',
        `- IsSearchAllAssets=${report.capture.searchAllAssets}：本报告只代表当前登记表快照，不宣称已经完成全盘资产发现。`,
        '- 已覆盖仅表示 SDK 中存在该类型路径，不代表所有成员完整或可调用。',
        '- 登记表不是全部游戏代码的清单；不包含普通 JS 模块或未反射的 C++ 成员。',
        '- 未覆盖的类型需要分批加载并重新采集反射，才能得出函数和属性签名。', ''].join('\n');
}
function main(args) {
    if (args.length !== 3) throw Error('Usage: node scripts/asset-coverage.cjs <loader.log> <type-index.json> <new-output-directory>');
    const [logFile,indexFile,out] = args, log = fs.readFileSync(logFile), indexBytes = fs.readFileSync(indexFile);
    const capture = decode(log.toString('utf8')), report = coverage(capture, JSON.parse(indexBytes));
    report.sources = {log:{path:path.resolve(logFile),sha256:sha256(log)}, index:{path:path.resolve(indexFile),sha256:sha256(indexBytes)}};
    fs.mkdirSync(out); // Never overwrite a prior evidence set.
    const write = (name,value) => fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
    write('asset-coverage.json',report);
    write('summary.json',Object.fromEntries(Object.entries(report).filter(([k])=>!['assets','types'].includes(k))));
    write('load-candidates.json',report.types.filter(a=>a.status==='not-in-sdk'||a.status==='candidate-unverified'));
    fs.writeFileSync(path.join(out,'report.md'),markdown(report));
    console.log(JSON.stringify({totalRegistryAssets:report.totalRegistryAssets,typeLikeAssets:report.typeLikeAssets,counts:report.counts,uniqueTypePaths:report.uniqueTypePaths,typeCounts:report.typeCounts},null,2));
}
module.exports = {decode, classify, coverage};
if (require.main === module) {try {main(process.argv.slice(2));} catch(e) {console.error(e.message);process.exitCode=1;}}
