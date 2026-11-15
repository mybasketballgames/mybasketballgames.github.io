/* 验证：单击不触发 / 长按屏幕激活自瞄 / 严格「拿到球才投」 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9357;
const FILE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const PROFILE = path.join(__dirname, 'edge-touch');
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + PROFILE, '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--use-gl=angle',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=960,640', 'about:blank'],
  { stdio: 'ignore', windowsHide: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => http.get(u, r => { let s = ''; r.on('data', d => s += d); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }); }).on('error', rej));

async function main() {
  let t;
  for (let i = 0; i < 60; i++) { try { const l = await getJSON('http://127.0.0.1:' + PORT + '/json/list'); t = l.find(x => x.type === 'page'); if (t) break; } catch (e) {} await wait(300); }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const p = new Map(); const errors = []; const requests = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && p.has(m.id)) { const q = p.get(m.id); p.delete(m.id); m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION ' + (m.params.exceptionDetails.text || ''));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push((m.params.args || []).map(a => a.value || a.description || '').join(' ').slice(0, 140));
    if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; p.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) console.log('EVAL ERR:', r.exceptionDetails.text); return r.result && r.result.value; };
  const mouse = async (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
  const click = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); };
  const st = async () => JSON.parse(await ev('JSON.stringify(window.__BR_TRAJ__.stats)'));
  const PIX = "(function(){var c=document.getElementById('br-traj-canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,n=0;for(var i=3;i<d.length;i+=4)if(d[i]>0)n++;return n})()";
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(__dirname, 'touch-' + n + '.png'), Buffer.from(r.data, 'base64')); };

  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Page.navigate', { url: FILE_URL });
  await wait(8000);
  let started = false;
  for (let i = 0; i < 14 && !started; i++) {
    await click(934 * 0.36, 547 * 0.65); await wait(450);
    await click(480, 300); await wait(450);
    const vy = await ev("(function(){var b=window.__BR_TRAJ__.ballInfo();if(!b||!b.ph)return 0;try{return b.ph.getVelocityY()}catch(e){return 0}})()");
    if (Math.abs(vy) > 5) started = true;
  }
  console.log('回合已启动:', started, '| 触摸自瞄默认:', await ev('window.__C3_SETTINGS__.touchAim'));
  await wait(600);

  await ev("(function(){var c=document.getElementById('c3-set-traj');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));var a=document.getElementById('br-auto');a.checked=true;a.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()");

  // ---- A 单击（<250ms）不应激活 ----
  console.log('\n=== A 鼠标单击（按住 120ms） ===');
  const a0 = await st();
  await mouse('mousePressed', 300, 330);
  await wait(120);
  const aMid = await st();
  await mouse('mouseReleased', 300, 330);
  await wait(400);
  const a1 = await st();
  console.log('按下 120ms 时 screenOn:', aMid.screenOn, '| shots:', a0.shots, '→', a1.shots,
    '| 松开后 screenOn:', a1.screenOn);
  console.log('判定:', (!aMid.screenOn && a1.shots === a0.shots && !a1.screenOn) ? 'PASS 单击不触发' : 'FAIL');

  // ---- B 长按左半屏 4 秒 ----
  console.log('\n=== B 长按左半屏 4 秒 ===');
  const b0 = await st();
  await mouse('mousePressed', 300, 330);
  await wait(400);
  const bMid = await st();
  await wait(1800);
  await shot('1-left-hold');
  const bMid2 = await st();
  await wait(1800);
  const b1 = await st();
  await mouse('mouseReleased', 300, 330);
  await wait(1000);
  const b2 = await st();
  console.log('400ms 时 screenOn:', bMid.screenOn, '| screenSide:', bMid.screenSide, '| active:', bMid.active,
    '| 2.2s 时 phase:', bMid2.phase, '| canShoot:', bMid2.canShoot);
  console.log('长按期间 shots +' + (b1.shots - b0.shots), '| hits +' + (b1.hits - b0.hits),
    '| 松开后 screenOn:', b2.screenOn, '| phase:', b2.phase, '| active:', b2.active,
    '| 画布像素:', await ev(PIX));
  console.log('判定:', (bMid.screenOn && bMid.screenSide === 'p1' && b2.screenOn === false) ? 'PASS' : 'FAIL');

  // ---- C 长按右半屏 2 秒 ----
  console.log('\n=== C 长按右半屏 2 秒 ===');
  await mouse('mousePressed', 640, 330);
  await wait(400);
  const cMid = await st();
  await wait(1200);
  await mouse('mouseReleased', 640, 330);
  await wait(300);
  console.log('400ms 时 screenOn:', cMid.screenOn, '| screenSide:', cMid.screenSide, '| active:', cMid.active);
  console.log('判定:', (cMid.screenOn && cMid.screenSide === 'p2') ? 'PASS' : 'FAIL');

  // ---- D 严格拿球审计 ----
  const log = JSON.parse(await ev('JSON.stringify(window.__BR_TRAJ__.stats.shotLog)'));
  const bad = log.filter(x => !(x.held === true || (x.heldAgo >= 0 && x.heldAgo <= 150)));
  console.log('\n=== D 严格拿球审计 ===');
  console.log('起投事件:', log.length, '| 未拿到球就起投:', bad.length);
  console.log(JSON.stringify(log.slice(0, 8)));
  console.log('判定:', bad.length === 0 ? 'PASS 全部在拿到球之后起投' : 'FAIL');

  // ---- E 关闭触摸自瞄后长按屏幕不激活 ----
  console.log('\n=== E 关闭「长按屏幕自瞄」 ===');
  await ev("(function(){var c=document.getElementById('c3-set-touch');c.checked=false;c.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()");
  await mouse('mousePressed', 300, 330);
  await wait(500);
  const e1 = await st();
  await mouse('mouseReleased', 300, 330);
  console.log('screenOn:', e1.screenOn, '| active:', e1.active, '判定:', (!e1.screenOn && !e1.active) ? 'PASS' : 'FAIL');

  console.log('\n比分:', await ev("JSON.stringify({p1:window.__BR_GLOBALVARS__.p1Score,p2:window.__BR_GLOBALVARS__.p2Score})"));
  console.log('异常:', errors.length, errors.slice(0, 4));
  console.log('游戏错误:', await ev('JSON.stringify(window.__GAME_ERRORS__||[])'));
  const ext = requests.filter(u => !u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:'));
  console.log('外网请求:', ext.length);
  ws.close();
}
main().then(() => { edge.kill(); process.exit(0); }).catch(e => { console.error('FAILED', e); edge.kill(); process.exit(1); });
