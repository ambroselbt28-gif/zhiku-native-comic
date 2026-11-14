// 使用独立无头 Chrome 和合成页面验证正式发布按钮，不连接宿主。
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const chrome = process.env.ZHIKU_TEST_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const scratch = path.join(root, '.tmp', 'browser');
fs.mkdirSync(scratch, { recursive: true });
const runtime = fs.readFileSync(path.join(root, 'runtime.js'), 'utf8');
const controller = runtime.slice(runtime.indexOf('const COMIC_BLOCK'), runtime.indexOf('// The entire editable instruction'));
const clickHandler = runtime.slice(runtime.indexOf('function onChatClick(ev)'), runtime.indexOf('function addMenuButton()'));
const module = controller + '\nconst N = { isReady: () => true };\n' + clickHandler + '\nexport { createComicController, onChatClick };';
const html = fs.readFileSync(path.join(root, 'dev/comic-browser.html'), 'utf8');
const server = http.createServer((request, response) => {
    const isModule = request.url === '/runtime-comic.js';
    response.setHeader('Content-Type', isModule ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    response.end(isModule ? module : html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    for (const width of [390, 768, 1366]) {
        const profile = path.join(scratch, String(width));
        const { stdout } = await promisify(execFile)(chrome, [
            '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
            '--disable-component-update', '--disable-sync', '--disable-extensions', '--disable-gpu',
            '--disable-crash-reporter', '--disable-crashpad', '--user-data-dir=' + profile,
            `--window-size=${width},900`, '--virtual-time-budget=5000', '--dump-dom', url,
        ], { env: { ...process.env, TEMP: scratch, TMP: scratch }, timeout: 30_000, maxBuffer: 1024 * 1024 });
        const reportText = stdout.match(/<pre id="results">([^<]*)<\/pre>/)?.[1];
        const report = JSON.parse((reportText || '{}').replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
        if (report.error || report.passed !== 10) throw new Error(`${width}px ${JSON.stringify(report)}`);
        console.log(`PASS ${width}px · ${report.passed} 项浏览器正式入口检查`);
    }
} finally {
    await new Promise(resolve => server.close(resolve));
}
