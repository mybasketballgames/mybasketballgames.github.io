/* 探针：确认 globalVars 结构与胜利阈值 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9334;
const FILE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(__dirname, 'edge-probe'), '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--use-gl=angle',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=960,640', 'about:blank'],
  { stdio: 'ignore', windowsHide: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => http.get(u, r => { let s = ''; r.on('data', d => s += d); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }); }).on('error', rej));

async function main() {
  let target;
  for (let i = 0; i < 60; i++) {
    try { const l = await getJSON('http://127.0.0.1:' + PORT + '/json/list'); target = l.find(t => t.type === 'page'); if (target) break; } catch (e) {}
    await wait(300);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result && r.result.value; };
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(__dirname, 'probe-' + n + '.png'), Buffer.from(r.data, 'base64')); };
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: FILE_URL });
  await wait(8000);
  console.log('globalVars keys:', await ev('JSON.stringify(Object.keys(window.__BR_GLOBALVARS__||{}))'));
  console.log('runtime exposed:', await ev('!!window.__BR_RUNTIME__'));
  console.log('initial scores:', await ev('JSON.stringify({p1:window.__BR_STATE__.p1,p2:window.__BR_STATE__.p2})'));

  // 进入 1P 对局
  await click(934 * 0.36, 547 * 0.65);
  await wait(2500);
  console.log('after start:', await ev('JSON.stringify({p1:window.__BR_STATE__.p1,p2:window.__BR_STATE__.p2,g1:window.__BR_GLOBALVARS__.p1Score})'));
  await shot('1-game');

  for (const v of [3, 4, 5, 7]) {
    await ev('window.__BR_GLOBALVARS__.p1Score=' + v + ';"ok"');
    await wait(1600);
    const s = await ev('JSON.stringify({set:' + v + ',now:window.__BR_GLOBALVARS__.p1Score,p2:window.__BR_GLOBALVARS__.p2Score,state:window.__BR_STATE__.p1})');
    console.log('set p1Score=' + v + ' ->', s);
    await shot('score-' + v);
  }
  ws.close();
}
main().then(() => { edge.kill(); process.exit(0); }).catch(e => { console.error(e); edge.kill(); process.exit(1); });
