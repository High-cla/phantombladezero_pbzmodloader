'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const compiler = path.join(path.dirname(require.resolve('typescript/package.json')),'bin/tsc');
test('npm tarball installs offline into a separate MOD and checks all declarations',t=>{
    const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'pbz packaged sdk '));
    t.after(()=>fs.rmSync(scratch,{recursive:true,force:true}));
    function run(script,args,cwd) {
        const r=spawnSync(process.execPath,[script,...args],{cwd,encoding:'utf8',maxBuffer:8*1024*1024});
        assert.ifError(r.error);assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout;
    }
    const [packed]=JSON.parse(run(npm,['pack','./sdk','--json','--ignore-scripts','--pack-destination',scratch],root));
    const sdkPackage=require('../sdk/package.json');
    assert.equal(packed.version,sdkPackage.version);
    const names=packed.files.map(f=>f.path);
    for(const file of ['index.d.ts','api-surface.json','generation-report.json','type-index.json','README.md','types/runtime.d.ts','types/generated/paths.d.ts']) assert.ok(names.includes(file),file);
    assert.ok(names.every(f=>/^(package\.json|index\.d\.ts|api-surface\.json|generation-report\.json|type-index\.json|README\.md|types\/.*\.d\.ts)$/.test(f)));
    fs.writeFileSync(path.join(scratch,'package.json'),JSON.stringify({name:'isolated-mod',private:true,devDependencies:{'@pbz-mod-loader/game-api':'file:./'+packed.filename}}));
    run(npm,['install','--offline','--ignore-scripts','--no-audit','--no-fund'],scratch);
    fs.copyFileSync(path.join(__dirname,'fixtures/sdk-usage.ts'),path.join(scratch,'main.ts'));
    fs.writeFileSync(path.join(scratch,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2020',module:'CommonJS',lib:['ES2020'],types:['@pbz-mod-loader/game-api'],strict:true,skipLibCheck:false,noEmitOnError:true,outDir:'dist'},include:['main.ts']}));
    run(compiler,['-p',scratch],root);
    const output=fs.readFileSync(path.join(scratch,'dist/main.js'),'utf8');
    assert.deepEqual([...output.matchAll(/require\("([^"]+)"\)/g)].map(m=>m[1]).sort(),['puerts','ue']);
    const installed=JSON.parse(fs.readFileSync(path.join(scratch,'node_modules/@pbz-mod-loader/game-api/package.json')));
    assert.equal(installed.version,sdkPackage.version);
    assert.equal(installed.main,undefined);assert.equal(installed.dependencies,undefined);
});
