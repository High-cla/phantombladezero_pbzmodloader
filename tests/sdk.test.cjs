'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const sdk = path.join(root, 'sdk');
const vendor = path.join(root, 'templates/ts-mod/vendor/game-api');
const compiler = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin/tsc');

test('template contains the exact SDK release and has no runtime dependency', () => {
    function files(dir) {
        return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
            entry.isDirectory() ? files(path.join(dir, entry.name)).map(file => entry.name + '/' + file) : [entry.name]
        ).sort();
    }
    assert.deepEqual(files(vendor), files(sdk), 'Run npm run sdk:sync');
    for (const file of files(sdk)) assert.deepEqual(fs.readFileSync(path.join(vendor, file)), fs.readFileSync(path.join(sdk, file)), file);
    const pkg = JSON.parse(fs.readFileSync(path.join(sdk, 'package.json')));
    const surface = JSON.parse(fs.readFileSync(path.join(sdk, 'api-surface.json')));
    assert.equal(surface.sdkVersion, pkg.version);
    assert.equal(pkg.main, undefined);
    assert.equal(pkg.dependencies, undefined);
    assert.ok(!files(sdk).some(file => /\.(?:js|cjs|mjs)$/.test(file)));
});

test('SDK checks real usage, nullability, ref types and module extensions in an isolated project', t => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pbz sdk '));
    t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
    const dependency = path.join(scratch, 'node_modules/@pbz-mod-loader/game-api');
    fs.cpSync(sdk, dependency, { recursive: true });
    fs.writeFileSync(path.join(scratch, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { target: 'ES2020', module: 'CommonJS', lib: ['ES2020'], types: ['@pbz-mod-loader/game-api'], strict: true, noEmitOnError: true, outDir: 'dist' },
        include: ['main.ts', 'custom.d.ts']
    }));
    fs.writeFileSync(path.join(scratch, 'custom.d.ts'), `declare module 'ue' { interface GameInstance { TestExtension(): string; } }`);
    fs.writeFileSync(path.join(scratch, 'main.ts'), `
import { argv, $ref, $unref, $set } from 'puerts';
import * as UE from 'ue';
import type { $Ref } from 'puerts';
const gi = argv.getByName('GameInstance');
// @ts-expect-error GameInstance can be missing at runtime.
gi.GetName();
if (gi) {
    const alias: UE.UObject = gi;
    const map: string = UE.GameplayStatics.GetCurrentLevelName(alias, true);
    const world: UE.World | null | undefined = gi.GetWorld();
    const extension: string = gi.TestExtension();
    const pawn = UE.GameplayStatics.GetPlayerPawn(gi, 0);
    if (pawn && UE.KismetSystemLibrary.IsValid(pawn)) {
        const x: number = pawn.K2_GetActorLocation().X;
        const yaw: number = pawn.K2_GetActorRotation().Yaw;
        const controller: UE.Controller | null | undefined = pawn.GetController();
        // @ts-expect-error Not exposed by this game.
        controller?.GetPawn();
    }
    // @ts-expect-error Player index must be a number.
    UE.GameplayStatics.GetPlayerPawn(gi, '0');
    // @ts-expect-error Null objects must be handled before native calls.
    UE.GameplayStatics.GetCurrentLevelName(null, true);
}
const ref = $ref(12);
$set(ref, 34);
const value: number = $unref(ref);
// @ts-expect-error Cannot assign a string to a numeric native ref.
$set(ref, 'invalid');
// @ts-expect-error Ref wrappers cannot be fabricated with a plain object.
const forged: $Ref<number> = {};
// @ts-expect-error This is a type-only interface, not an exposed constructor.
new UE.Vector();
// @ts-expect-error This is not a declared gameplay API.
UE.GameplayStatics.DoesNotExist();
// @ts-expect-error Misspelled startup argument must be rejected.
argv.getByName('GameInstnace');
// @ts-expect-error Only the verified startup index is exposed.
argv.getByIndex(99);
// @ts-expect-error No Node.js runtime globals.
process.cwd();
// @ts-expect-error No browser globals.
window.document;
`);
    const result = spawnSync(process.execPath, [compiler, '-p', scratch], { encoding: 'utf8' });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const output = fs.readFileSync(path.join(scratch, 'dist/main.js'), 'utf8');
    const modules = [...output.matchAll(/require\("([^"]+)"\)/g)].map(match => match[1]);
    assert.deepEqual(modules.sort(), ['puerts', 'ue']);
});
