/* 用真实 Edge (headless) 以 file:// 协议打开成品，验证运行时、设置面板和实际对局 */
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
  '--headless=new',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + PROFILE,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--window-size=960,640',
  'about:blank'
], { stdio: 'ignore', windowsHide: true });

const wait = ms => new Promise(r => setTimeout(r, ms));
function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let s = '';
      res.on('data', d => s += d);
      res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
async function findTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await getJSON('http://127.0.0.1:' + PORT + '/json/list');
      const page = list.find(t => t.type === 'page');
      if (page) return page;
    } catch (e) { /* not up yet */ }
    await wait(300);
  }
  throw new Error('DevTools endpoint not ready');
}

async function run() {
  const target = await findTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  const logs = [], errors = [], external = [];
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || []).map(a => a.value !== undefined ? a.value : (a.description || a.type)).join(' ');
      logs.push('[' + msg.params.type + '] ' + text.slice(0, 220));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push('EXCEPTION ' + (d.text || '') + ' ' + (d.exception && (d.exception.description || d.exception.value) || ''));
    } else if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error') logs.push('[log.error] ' + e.text.slice(0, 220));
    } else if (msg.method === 'Network.requestWillBeSent') {
      const u = msg.params.request.url;
      if (!/^(file|data|blob|about):/i.test(u) && !u.startsWith('http://127.0.0.1')) external.push(u);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const screenshot = async name => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(shot(name), Buffer.from(r.data, 'base64'));
  };
  const mouseClick = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  const keyPress = async (key, code, vk) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await wait(90);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  };

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Network.enable');
  console.log('navigating:', FILE_URL);
  await send('Page.navigate', { url: FILE_URL });
  await wait(9000);

  const diag = await evaluate(`JSON.stringify({
    errors: window.__GAME_ERRORS__ || null,
    isSupported: window.C3_IsSupported,
    c3canvas: window.c3canvas ? {w: window.c3canvas.width, h: window.c3canvas.height} : null,
    canvasRect: window.c3canvas ? (function(r){return {x:r.x,y:r.y,w:r.width,h:r.height}})(window.c3canvas.getBoundingClientRect()) : null,
    hasC3: !!window.C3,
    hasJSInEvents: !!(window.C3 && window.C3.JavaScriptInEvents),
    hasAudioDOM: !!window.C3Audio_DOMInterface,
    settings: window.__C3_SETTINGS__ || null,
    hitCount: Object.keys(window.__GAME_ASSET_HITS__ || {}).length,
    hits: window.__GAME_ASSET_HITS__ || {},
    workerURLs: Object.keys(window.__C3_WORKER_URLS__ || {}).length
  })`);
  const d = JSON.parse(diag);
  console.log('\n===== 1. 启动诊断 =====');
  console.log(JSON.stringify({
    errors: d.errors, isSupported: d.isSupported, c3canvas: d.c3canvas, canvasRect: d.canvasRect,
    hasC3: d.hasC3, hasJSInEvents: d.hasJSInEvents, hasAudioDOM: d.hasAudioDOM,
    settings: d.settings, workerURLs: d.workerURLs, hitCount: d.hitCount
  }, null, 2));
  const hitKeys = Object.keys(d.hits);
  console.log('wasm loaded:', !!d.hits['box2d.wasm'], '| data.json:', !!d.hits['data.json'],
    '| images:', hitKeys.filter(k => k.startsWith('images/')).length,
    '| media:', hitKeys.filter(k => k.startsWith('media/')).length,
    '| icon:', !!d.hits['icons/loading-logo.png']);
  await screenshot('1-title');

  // ---- 设置面板交互 ----
  console.log('\n===== 2. 设置面板 =====');
  const btnRect = await evaluate(`(function(){var r=document.getElementById('c3-set-btn').getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2})})()`);
  const b = JSON.parse(btnRect);
  await mouseClick(b.x, b.y);
  await wait(300);
  console.log('panel opened:', await evaluate(`!document.getElementById('c3-set-panel').hidden`));

  await evaluate(`(function(){var v=document.getElementById('c3-set-vol');v.value=45;v.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait(700);
  console.log('volume 45% -> gain:', await evaluate(`(function(){var a=window.C3Audio_DOMInterface;return a&&a._destinationNode?a._destinationNode.gain.value:'no-audio-node'})()`));
  console.log('volume label:', await evaluate(`document.getElementById('c3-set-vol-val').textContent`));

  await evaluate(`(function(){var c=document.getElementById('c3-set-mute');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait(500);
  console.log('muted -> gain:', await evaluate(`(function(){var a=window.C3Audio_DOMInterface;return a&&a._destinationNode?a._destinationNode.gain.value:'no-audio-node'})()`));
  await evaluate(`(function(){var c=document.getElementById('c3-set-mute');c.checked=false;c.dispatchEvent(new Event('change',{bubbles:true}));})()`);

  await evaluate(`(function(){var c=document.getElementById('c3-set-fps');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait(700);
  console.log('fps visible:', await evaluate(`!document.getElementById('c3-fps').hidden`), '| fps text:', await evaluate(`document.getElementById('c3-fps').textContent`));
  await evaluate(`(function(){var c=document.getElementById('c3-set-hints');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  console.log('hints visible:', await evaluate(`!document.getElementById('c3-hintbar').hidden`));
  console.log('settings persisted:', await evaluate(`localStorage.getItem('basketRandomOfflineSettings')`));
  await screenshot('2-settings');
  await evaluate(`document.getElementById('c3-set-close').click()`);
  console.log('panel closed:', await evaluate(`document.getElementById('c3-set-panel').hidden`));

  // ---- 实际对局：点击 1P，再按 W ----
  console.log('\n===== 3. 进入对局 =====');
  const r = d.canvasRect;
  const x1 = r.x + r.w * 0.36, y1 = r.y + r.h * 0.65;
  await mouseClick(x1, y1);
  await wait(2500);
  await screenshot('3-game');
  for (let i = 0; i < 4; i++) { await keyPress('w', 'KeyW', 87); await wait(350); }
  await wait(1200);
  await screenshot('4-after-keys');

  const final = await evaluate(`JSON.stringify({
    errors: window.__GAME_ERRORS__ || [],
    hitCount: Object.keys(window.__GAME_ASSET_HITS__ || {}).length,
    fps: document.getElementById('c3-fps').textContent,
    hint: !document.getElementById('c3-hintbar').hidden,
    canvases: document.querySelectorAll('canvas').length
  })`);
  console.log('final:', final);

  console.log('\n===== 4. 控制台 =====');
  console.log('external network requests:', external.length);
  external.slice(0, 10).forEach(u => console.log('  ' + u.slice(0, 160)));
  console.log('console messages:', logs.length, '| exceptions:', errors.length);
  logs.slice(0, 25).forEach(l => console.log('  ' + l));
  errors.slice(0, 10).forEach(l => console.log('  ' + l));

  console.log('\nscreenshots:', ['1-title', '2-settings', '3-game', '4-after-keys'].map(n => shot(n)).join(', '));
  ws.close();
}

run().then(() => { edge.kill(); process.exit(0); })
  .catch(e => { console.error('TEST FAILED:', e); edge.kill(); process.exit(1); });
