/* 验证：长按激活 / 未长按不生效 / 每次起投都有合法可投窗口 / 松开清空 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9353;
const FILE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(__dirname, 'edge-gate'), '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--use-gl=angle',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=960,640', 'about:blank'],
  { stdio: 'ignore', windowsHide: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => http.get(u, r => { let s = ''; r.on('data', d => s += d); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }); }).on('error', rej));

const PIX = "(function(){var c=document.getElementById('br-traj-canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,n=0;for(var i=3;i<d.length;i+=4)if(d[i]>0)n++;return n})()";

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
  const key = async (type, k, code, vk) => {
    const one = k.length === 1;
    return send('Input.dispatchKeyEvent', Object.assign({ type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk },
      type === 'keyDown' && one ? { text: k, unmodifiedText: k } : {}));
  };
  const st = async () => JSON.parse(await ev('JSON.stringify(window.__BR_TRAJ__.stats)'));
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(__dirname, 'gate-' + n + '.png'), Buffer.from(r.data, 'base64')); };

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
  console.log('回合已启动:', started);
  await wait(500);

  await ev("(function(){var c=document.getElementById('c3-set-traj');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));var a=document.getElementById('br-auto');a.checked=true;a.dispatchEvent(new Event('change',{bubbles:true}));var s=document.getElementById('br-side');s.value='both';s.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()");
  await ev("window.__MON__=[];window.__MON_T__=setInterval(function(){var s=window.__BR_TRAJ__.stats;window.__MON__.push({cs:s.canShoot,ph:s.phase,d:s.drawn,a:s.active,sh:s.shots,hi:s.hits});},60);'ok'");
  console.log('配置:', await ev("JSON.stringify({traj:window.__C3_SETTINGS__.traj,auto:window.__BR_ADMIN__.cfg.auto,side:window.__BR_ADMIN__.cfg.side})"));

  // ---- A 未长按：不能激活、不能绘制、不能起投 ----
  const a0 = await st();
  await wait(1400);
  const a1 = await st();
  console.log('\n=== A 未长按 ===');
  console.log('active:', a1.active, '| drawn:', a1.drawn, '| shots:', a0.shots, '→', a1.shots,
    '| 画布像素:', await ev(PIX));
  console.log('判定:', (!a1.active && !a1.drawn && a1.shots === a0.shots) ? 'PASS' : 'FAIL');

  // ---- B 长按 W 6 秒：激活 + 持续显示 + 连续起投 ----
  console.log('\n=== B 长按 W 6 秒 ===');
  const b0 = await st();
  await key('keyDown', 'w', 'KeyW', 87);
  for (let i = 0; i < 20; i++) { await wait(300); await key('keyDown', 'w', 'KeyW', 87); if (i === 8) await shot('1-holding'); }
  const b1 = await st();
  await key('keyUp', 'w', 'KeyW', 87);
  console.log('长按中 active:', b1.active, '| drawn:', b1.drawn,
    '| shots +' + (b1.shots - b0.shots), '| hits +' + (b1.hits - b0.hits));

  // ---- C 松开：立即停止并清空 ----
  await wait(500);
  const c1 = await st();
  const px = await ev(PIX);
  console.log('\n=== C 松开 ===');
  console.log('active:', c1.active, '| phase:', c1.phase, '| 画布像素:', px, px === 0 ? 'PASS' : 'FAIL');

  // ---- D 起投审计：每次起投都发生在合法可投窗口 ----
  const log = JSON.parse(await ev('JSON.stringify(window.__BR_TRAJ__.stats.shotLog)'));
  const mon = JSON.parse(await ev('JSON.stringify(window.__MON__)'));
  const OK_WHY = ['本方持球', '刚拿到球'];
  const bad = log.filter(x => OK_WHY.indexOf(x.why) < 0).length;
  const phases = {};
  mon.forEach(x => { phases[x.ph] = (phases[x.ph] || 0) + 1; });
  console.log('\n=== D 起投审计 ===');
  console.log('起投事件:', log.length, '| 无合法原因:', bad, '| 监视帧数:', mon.length);
  console.log('前 6 条:', JSON.stringify(log.slice(0, 6)));
  console.log('phase 分布:', JSON.stringify(phases));
  console.log('判定:', (bad === 0 && b1.shots > b0.shots && b1.active && b1.drawn) ? 'PASS' : 'FAIL');

  console.log('\n比分:', await ev("JSON.stringify({p1:window.__BR_GLOBALVARS__.p1Score,p2:window.__BR_GLOBALVARS__.p2Score})"));
  console.log('异常:', errors.length, errors.slice(0, 4));
  console.log('游戏错误:', await ev('JSON.stringify(window.__GAME_ERRORS__||[])'));
  const ext = requests.filter(u => !u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:'));
  console.log('外网请求:', ext.length);
  ws.close();
}
main().then(() => { edge.kill(); process.exit(0); }).catch(e => { console.error('FAILED', e); edge.kill(); process.exit(1); });
