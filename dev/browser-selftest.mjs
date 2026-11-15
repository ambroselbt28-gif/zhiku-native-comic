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
const floorButtons = runtime.slice(runtime.indexOf('function addMesButtons()'),runtime.indexOf('function onChatClick(ev)'));
const backfill = runtime.slice(runtime.indexOf('// 只调度当前聊天'), runtime.indexOf('const COMIC_BLOCK'));
const characters = fs.readFileSync(path.join(root, 'src/image-characters.js'), 'utf8').replace(/^export /gm, '');
const illustration = runtime.slice(runtime.indexOf('// The entire editable instruction'), runtime.indexOf('function createIllustrationPlanner'));
const illustrationEditor = runtime.slice(runtime.indexOf('function renderIllustrationEditor'), runtime.indexOf('function selectionTextMap'));
const profiles = runtime.slice(runtime.indexOf('// 自动人物建档与外貌方案版本'), runtime.indexOf('// 面板和悬浮入口控制同一个队列'));
const markers = runtime.slice(runtime.indexOf('// Marker-triggered generation'), runtime.indexOf('const pcLocal ='));
const profileActions = runtime.slice(runtime.indexOf("case 'profile-open':"), runtime.indexOf("case 'casttab':", runtime.indexOf("case 'profile-open':")));
const backfillAction = runtime.slice(runtime.indexOf("case 'image-backfill':"), runtime.indexOf("case 'comicbook':", runtime.indexOf("case 'image-backfill':")));
const naiNetwork = runtime.slice(runtime.indexOf('function createNaiNetwork('), runtime.indexOf('const naiNetwork ='));
const networkUiStart = runtime.indexOf('<label class="pc-field"><span>官方联网通道</span>');
const networkUiEndText = '测试成功不保证生图 POST 成功。</div>';
const networkUi = runtime.slice(networkUiStart, runtime.indexOf(networkUiEndText, networkUiStart) + networkUiEndText.length);
if (networkUiStart < 0) throw new Error('缺少联网选择界面');
const networkChangeStart = runtime.indexOf('    if (el.dataset.st) {');
const networkChange = runtime.slice(networkChangeStart, runtime.indexOf('    if (el.dataset.stCheck)', networkChangeStart));
const networkAction = runtime.slice(runtime.indexOf("case 'naiprobe':"), runtime.indexOf("case 'naitest':"));
let networkUiModule = '\nfunction renderNetworkControls(n) { return `' + networkUi + '`; }\n'
    + 'function networkSettingsChange(el,N,ui,render) {' + networkChange + '}\n'
    + 'async function runNetworkProbe(el,N,ui,render) {switch(el.dataset.act){' + networkAction + '}}\n';
const referencePicker = runtime.slice(runtime.indexOf('// 角色参考分组：'), runtime.indexOf('// 角色参考分组结束。'));
// 使用正式预设界面、条目读取和切换/复制处理器，配置只存在合成页面内。
const presetView = runtime.slice(runtime.indexOf('function viewAiPreset(d)'), runtime.indexOf('/** 分享画师串时一起带上的出图参数'));
const presetEntries = runtime.slice(runtime.indexOf('function entriesFor('), runtime.indexOf('function markText('));
const presetUse = runtime.slice(runtime.indexOf("case 'aipuse':"), runtime.indexOf("case 'aipnew':"));
const presetCopy = runtime.slice(runtime.indexOf("case 'aipcopy':"), runtime.indexOf("case 'aiprename':"));
networkUiModule += runtime.slice(runtime.indexOf('// 古风预设：'),runtime.indexOf('// 古风预设模块结束。'));
networkUiModule += `
export function mountCameraPresetTest(root) {
    const cfg={active:'plain',list:{},fn:{},markOn:{}},ui={};
    const aiCfg=()=>cfg,stPresetCache=null;
    ${presetEntries}
    const T={aiCfg,entriesFor,currentTavernPreset:()=>'',AI_FNS:[]};
    const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
    let id=0,saves=0;const M={uid:()=>String(++id)},commit=()=>saves++;
    const toastr={success(){},info(){}},render=()=>{root.innerHTML=viewAiPreset({});};
    ${presetView}
    root.addEventListener('click',event=>{const el=event.target.closest('[data-act]');if(!el)return;switch(el.dataset.act){${presetUse}${presetCopy}}});
    render();return {cfg,entriesFor,saves:()=>saves,render};
}
`;
networkUiModule += '\nconst DOC=document,__mod_marker={decorateAll(){}};\n' + floorButtons + '\nexport {addMesButtons};\n';
const pauseControl=runtime.slice(runtime.indexOf('// 面板和悬浮入口控制同一个队列'),runtime.indexOf('// 古风预设：'));
const gateControl=runtime.slice(runtime.indexOf('function createNaiGate('),runtime.indexOf('const __naiGate='));
const pauseHeader=runtime.match(/<div class="pc-generation-row">[^\n]+/)[0];
networkUiModule += pauseControl+'\n'+gateControl+'\nexport {createGenerationPauseControls,createNaiGate};\nexport function generationPauseHeader(queue){const N={queueControl:queue};return `'+pauseHeader+'`;}\n';
const memberPicker=runtime.slice(runtime.indexOf('// 画师组成员选择：'),runtime.indexOf('// 画师组成员选择结束。'));
const memberAction=runtime.slice(runtime.indexOf("case 'addmember':"),runtime.indexOf("case 'editstring':",runtime.indexOf("case 'addmember':")));
networkUiModule+=memberPicker+`
export function mountArtistMemberTest(data){
    let saves=0,box;
    const getData=()=>data,esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
    const M={banInfo:()=>null,parseArtistList:()=>[],ensureArtist:()=>null};
    const commit=()=>saves++,toastr={success(){}};
    const modal=html=>{box=document.createElement('section');box.style.cssText='max-width:600px;width:100%;box-sizing:border-box;margin:auto';box.innerHTML=html;box.closeModal=()=>box.remove();document.body.append(box);return box;};
    const el={dataset:{id:'group'}};switch('addmember'){${memberAction}}
    return {box,saves:()=>saves};
}
`;
const referenceAction = runtime.match(/case 'charrefpick': ([^\n]+)/)?.[1];
if (!referenceAction) throw new Error('缺少正式参考绑定操作');
const module = networkUiModule + referencePicker + '\nfunction pickCharacterReference(c,el,save) {'+referenceAction+'}\n' + naiNetwork + '\n' + characters + '\n' + illustration + '\n' + illustrationEditor + '\n' + profiles + '\n' + markers + '\n' + backfill + '\n' + controller + '\nconst N = { isReady: () => true };\n' + clickHandler
    + '\nfunction onBackfillClick(ev) { const ui = {view:"comic"}; switch(ev.target.dataset.act) {' + backfillAction + '} }'
    + '\nasync function profileAction(act,key,el={dataset:{}}) { const ui={charKey:key};const promptText=(...args)=>globalThis.__profilePrompt(...args); switch(act) {'+profileActions+'} }'
    + '\nexport { renderNetworkControls, networkSettingsChange, runNetworkProbe, renderCharacterReferencePicker, pickCharacterReference, createNaiNetwork, createComicController, comicLayoutExample, onChatClick, createImageBackfill, createImageBackfillUI, onBackfillClick, renderIllustrationEditor, createIllustrationEditor, createAutoCharacterProfiles, createProfileEditor, renderAppearancePresets, profileAction };';
const html = fs.readFileSync(path.join(root, 'dev/comic-browser.html'), 'utf8');
const reloadEntry = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const reloadTest = fs.readFileSync(path.join(root, 'dev/update-reload-browser.js'), 'utf8');
const reloadGuard = runtime.match(/    canReload: \(\) => ([^\n]+),\n/)?.[1];
if (!reloadGuard) throw new Error('缺少正式重载空闲条件');
let reloadModuleId = 0;
const server = http.createServer((request, response) => {
    if (request.url === '/reload-entry.js' || request.url === '/update-reload-browser.js' || request.url.startsWith('/runtime.js?')) {
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.end(request.url === '/reload-entry.js' ? reloadEntry : request.url === '/update-reload-browser.js' ? reloadTest :
            `const id=${++reloadModuleId};export const runtimeVersion=String(id);export function createRuntime(){const DOC=document,__zhikuActivity={idle:()=>!globalThis.__reloadTest.busy};return{canReload:()=>${reloadGuard},async start(){globalThis.__reloadTest.starts.push(id);},async stop(){globalThis.__reloadTest.stops.push(id);}};}`);
        return;
    }
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
            `--window-size=${width},900`, '--virtual-time-budget=15000', '--dump-dom', url,
        ], { env: { ...process.env, TEMP: scratch, TMP: scratch }, timeout: 30_000, maxBuffer: 1024 * 1024 });
        const reportText = stdout.match(/<pre id="results">([^<]*)<\/pre>/)?.[1];
        const report = JSON.parse((reportText || '{}').replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
        if (report.error || report.passed !== 153) throw new Error(`${width}px ${JSON.stringify(report)}`);
        console.log(`PASS ${width}px · ${report.passed} 项浏览器正式入口检查`);
    }
} finally {
    await new Promise(resolve => server.close(resolve));
}
