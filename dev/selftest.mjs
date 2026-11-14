// 在本仓库 .tmp 内执行全部合成回归，不读取宿主实例。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporaryRoot = path.join(root, '.tmp', 'selftest');
fs.mkdirSync(temporaryRoot, { recursive: true });
for (const source of ['index.js', 'runtime.js', 'src/comic.js', 'src/nai-request-compat.js']) {
    execFileSync(process.execPath, ['--check', path.join(root, source)], { stdio: ['ignore', 'pipe', 'pipe'] });
}
const tests = fs.readdirSync(path.join(root, 'tests')).filter(name => name.endsWith('.mjs')).sort();
const failures = [];
for (const test of tests) {
    try {
        execFileSync(process.execPath, [path.join(root, 'tests', test)], {
            cwd: root,
            env: { ...process.env, TEMP: temporaryRoot, TMP: temporaryRoot },
            encoding: 'utf8', timeout: 90_000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
        });
        console.log('PASS ' + test);
    } catch (error) {
        failures.push(test);
        console.error('FAIL ' + test + '\n' + String(error.stderr || error.stdout || error.message));
    }
}
console.log(`${tests.length - failures.length}/${tests.length} 个测试文件通过`);
if (failures.length) process.exitCode = 1;
