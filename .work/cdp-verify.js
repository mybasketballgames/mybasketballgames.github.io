/* 用真实 Edge (headless) 以 file:// 协议验证全部功能 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9333;
const PROFILE = path.join(__dirname, 'edge-profile');
const FILE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const shot = n => path.join(__dirname, 'shot-' + n + '.png');

const edge = spawn(EDGE, [
  '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--window-size=960,640', 'about:blank'
], { stdio: 'ignore', windowsHide: true });

const wait = ms => new Promise(r => setTimeout(r, ms));
const getJSON = url => new Promise((resolve, reject) => {
  http.get(url, res => {
    let s = ''; res.on('data', d => s += d);
    res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { reject(e); } });
  }).on('error', reject);
});
async function findTarget() {
  for (let i = 0; i < 60; i++) {
    try { const l = await getJSON('http://127.0.0.1:' + PORT + '/json/list'); const p = l.find(t => t.type === 'page'); if (p) return p; } catch (e) {}
    await wait(300);
  }
  throw new Error('DevTools endpoint not ready');
}

async function run() {
  const target = await findTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  const logs = [], errors = [], external = [];
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const t = (msg.params.args || []).map(a => a.value !== undefined ? a.value : (a.description || a.type)).join(' ');
      logs.push('[' + msg.params.type + '] ' + t.slice(0, 180));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push('EXCEPTION ' + (d.text || '') + ' ' + (d.exception && (d.exception.description || d.exception.value) || ''));
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      logs.push('[log.error] ' + msg.params.entry.text.slice(0, 180));
    } else if (msg.method === 'Network.requestWillBeSent') {
      const u = msg.params.request.url;
      if (!/^(file|data|blob|about):/i.test(u) && !u.startsWith('http://127.0.0.1')) external.push(u);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id; pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const ev = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const screenshot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(shot(n), Buffer.from(r.data, 'base64')); };
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  const key = async (k, code, vk) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await wait(80);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  };
  const setChk = (idname, v) => ev("(function(){var c=document.getElementById('" + idname + "');c.checked=" + v + ";c.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()");
  const diagExpr = `JSON.stringify({
    errors: window.__GAME_ERRORS__ || [],
    isSupported: window.C3_IsSupported,
    hasC3: !!window.C3,
    hasRuntime: !!window.__BR_RUNTIME__,
    layout: (window.__BR_STATE__||{}).layout,
    state: window.__BR_STATE__ ? {infinite:window.__BR_STATE__.infinite,unlimitedFPS:window.__BR_STATE__.unlimitedFPS,lang:window.__BR_STATE__.lang,p1:window.__BR_STATE__.p1,p2:window.__BR_STATE__.p2} : null,
    dataInfiniteHits: (window.__GAME_ASSET_HITS__||{})['data.json.infinite'] || 0,
    hitCount: Object.keys(window.__GAME_ASSET_HITS__||{}).length,
    wasm: !!(window.__GAME_ASSET_HITS__||{})['box2d.wasm'],
    images: Object.keys(window.__GAME_ASSET_HITS__||{}).filter(k=>k.indexOf('images/')===0).length,
    media: Object.keys(window.__GAME_ASSET_HITS__||{}).filter(k=>k.indexOf('media/')===0).length,
    fpsHidden: document.getElementById('c3-fps').hidden,
    scoreHidden: document.getElementById('c3-scoreboard').hidden,
    labelsHidden: document.getElementById('c3-cn-labels').hidden,
    langText: document.querySelector('[data-i18n="title"]').textContent,
    hintText: document.getElementById('c3-hintbar').textContent.slice(0,60),
    fpsText: document.getElementById('c3-fps').textContent,
    scoreText: document.getElementById('c3-scoreboard').textContent
  })`;
  const diag = async label => { const d = JSON.parse(await ev(diagExpr)); console.log('\n--- ' + label + ' ---'); console.log(JSON.stringify(d, null, 1)); return d; };

  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Page.navigate', { url: FILE_URL });
  await wait(3500);
  await ev('localStorage.clear(); location.reload(); "ok"');
  await wait(8500);

  await diag('A 默认（中文 / 标准模式）');
  await screenshot('A-title-zh');
  console.log('A 中文标注可见:', await ev("!document.getElementById('c3-cn-labels').hidden"));

  console.log('\n===== B 帧率显示 / 覆盖层 =====');
  await setChk('c3-set-fps', true);
  await setChk('c3-set-hints', true);
  await setChk('c3-set-scoreboard', true);
  await wait(1200);
  console.log('fps文本:', await ev("document.getElementById('c3-fps').textContent"));
  console.log('fps可见:', await ev("!document.getElementById('c3-fps').hidden"),
    '| 提示:', await ev("!document.getElementById('c3-hintbar').hidden"),
    '| 比分板:', await ev("document.getElementById('c3-scoreboard').textContent"));
  await screenshot('B-overlays');

  console.log('\n===== C 解除帧率限制 =====');
  await setChk('c3-set-unlimitedfps', true);
  await wait(2500);
  console.log('state.unlimitedFPS:', await ev('window.__BR_STATE__.unlimitedFPS'));
  console.log('解锁后 fps文本:', await ev("document.getElementById('c3-fps').textContent"));
  console.log('异常:', await ev('JSON.stringify(window.__GAME_ERRORS__||[])'));
  await setChk('c3-set-unlimitedfps', false);
  await wait(600);

  console.log('\n===== D 切换为英文 =====');
  await ev("(function(){var s=document.getElementById('c3-set-lang');s.value='en';s.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()");
  await wait(8000);
  const D = await diag('D 英文界面');
  await screenshot('D-settings-en');
  console.log('英文标题:', D.langText, '| 提示:', D.hintText);

  await ev("(function(){var s=document.getElementById('c3-set-lang');s.value='zh';s.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()");
  await wait(8000);
  console.log('切回中文标题:', await ev("document.querySelector('[data-i18n=\"title\"]').textContent"));

  console.log('\n===== E 无限模式 =====');
  await setChk('c3-set-infinite', true);
  await wait(8500);
  const E = await diag('E 无限模式');
  console.log('无限版 data.json 命中次数:', E.dataInfiniteHits, '(应 > 0)');
  console.log('无限模式已勾选:', await ev("document.getElementById('c3-set-infinite').checked"));

  console.log('\n===== F 进入对局 =====');
  await click(934 * 0.36, 547 * 0.65);
  await wait(2200);
  await setChk('c3-set-fps', true);
  await wait(700);
  await screenshot('F-game-infinite');
  for (let i = 0; i < 3; i++) { await key('w', 'KeyW', 87); await wait(300); }
  await wait(900);
  await screenshot('G-after-keys');
  await diag('F 对局中');

  console.log('\n===== 汇总 =====');
  console.log('外部网络请求:', external.length);
  external.slice(0, 6).forEach(u => console.log('  ' + u.slice(0, 120)));
  console.log('异常:', errors.length, '| 控制台消息:', logs.length);
  logs.slice(0, 15).forEach(l => console.log('  ' + l));
  errors.slice(0, 8).forEach(l => console.log('  ' + l));
  console.log('截图: A-title-zh, B-overlays, D-settings-en, F-game-infinite, G-after-keys');
  ws.close();
}
run().then(() => { edge.kill(); process.exit(0); }).catch(e => { console.error('TEST FAILED:', e); edge.kill(); process.exit(1); });
