/* 验证：长按投篮键 12 秒全程有效（含 >4 秒后），自瞄能连续起投 */
'use strict';
const { spawn } = require('child_process');
const { createHash } = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9355;
const FILE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(__dirname, 'edge-longhold'), '--no-first-run',
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
  const key = async (type, k, code, vk, mods) => {
    const one = k.length === 1;
    return send('Input.dispatchKeyEvent', Object.assign({ type, key: k, code, modifiers: mods || 0, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk },
      type === 'keyDown' && one ? { text: k, unmodifiedText: k } : {}));
  };
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(__dirname, 'long-' + n + '.png'), Buffer.from(r.data, 'base64')); };

  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Page.navigate', { url: FILE_URL });
  await wait(8000);
  for (let i = 0; i < 10; i++) {
    await click(934 * 0.36, 547 * 0.65); await wait(450);
    await click(480, 300); await wait(450);
    const vy = await ev("(function(){var b=window.__BR_TRAJ__.ballInfo();if(!b||!b.ph)return 0;try{return b.ph.getVelocityY()}catch(e){return 0}})()");
    if (Math.abs(vy) > 5) break;
  }
  await wait(500);

  await ev("(function(){var c=document.getElementById('c3-set-traj');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));var a=document.getElementById('br-auto');a.checked=true;a.dispatchEvent(new Event('change',{bubbles:true}));var s=document.getElementById('br-side');s.value='both';s.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()");
  console.log('配置:', await ev("JSON.stringify({traj:window.__C3_SETTINGS__.traj,auto:window.__BR_ADMIN__.cfg.auto,everOpened:window.__BR_ADMIN__.cfg.everOpened})"));

  // 采样器：记录长按期间每帧状态
  await ev("window.__LH__=[];window.__LH_T0__=performance.now();window.__LH_T__=setInterval(function(){var s=window.__BR_TRAJ__.stats;window.__LH__.push({t:Math.round(performance.now()-window.__LH_T0__),h:s.held,a:s.active,d:s.drawn,sh:s.shots,hi:s.hits,ph:s.phase,bh:s.ballHeld,cs:s.canShoot});},100);'ok'");
  const W = { k: 'w', c: 'KeyW', v: 87 };
  console.log('\n=== 长按 W 12 秒（每 300ms 模拟自动重复） ===');
  const hp0 = await ev('window.__BR_TRAJ__.stats.shots');
  await key('keyDown', W.k, W.c, W.v);
  for (let i = 0; i < 40; i++) {
    await wait(300);
    await key('keyDown', W.k, W.c, W.v);
    if (i === 10) await shot('1-hold-3s');
    if (i === 25) await shot('2-hold-8s');
  }
  await key('keyUp', W.k, W.c, W.v);
  await wait(300);
  const hp1 = await ev('JSON.stringify(window.__BR_TRAJ__.stats)');
  const fin = JSON.parse(hp1);
  console.log('起投:', hp0, '→', fin.shots, '| 命中:', fin.hits, '| 制导帧:', fin.guided);
  console.log('松开后 active:', fin.active, '| phase:', fin.phase);

  const lh = JSON.parse(await ev('JSON.stringify(window.__LH__)'));
  const total = lh.length;
  const activeN = lh.filter(x => x.a).length, drawnN = lh.filter(x => x.d).length;
  const early = lh.filter(x => x.t < 4000), late = lh.filter(x => x.t >= 5000 && x.t < 12000);
  const earlyShots = early.length ? early[early.length - 1].sh - early[0].sh : 0;
  const lateShots = late.length ? late[late.length - 1].sh - late[0].sh : 0;
  const phases = {};
  lh.forEach(x => { phases[x.ph] = (phases[x.ph] || 0) + 1; });
  console.log('\n=== 逐帧统计（' + total + ' 个采样点 / 12s） ===');
  console.log('active 常亮比例:', (100 * activeN / total).toFixed(1) + '%',
    '| 抛物线绘制比例:', (100 * drawnN / total).toFixed(1) + '%');
  const log = JSON.parse(await ev('JSON.stringify(window.__BR_TRAJ__.stats.shotLog)'));
  const badShots = log.filter(x => !(x.held === true || (x.heldAgo >= 0 && x.heldAgo <= 150)));
  console.log('前 4 秒起投:', earlyShots, '| 第 5–12 秒起投:', lateShots, '（>0 证明没有 4 秒超时失效）');
  console.log('phase 分布:', JSON.stringify(phases));
  console.log('未拿到球就起投:', badShots.length, '| 起投明细:', JSON.stringify(log.slice(0, 6)));
  console.log('判定:', (activeN / total > 0.95 && drawnN / total > 0.95 && fin.shots > hp0 && badShots.length === 0)
    ? 'PASS 长按全程有效、且全部在拿到球之后起投' : 'FAIL');

  const px = await ev("(function(){var c=document.getElementById('br-traj-canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,n=0;for(var i=3;i<d.length;i+=4)if(d[i]>0)n++;return n})()");
  console.log('松开后画布像素:', px, px === 0 ? 'PASS' : 'FAIL');
  console.log('\n异常:', errors.length, errors.slice(0, 4));
  console.log('游戏错误:', await ev('JSON.stringify(window.__GAME_ERRORS__||[])'));
  const ext = requests.filter(u => !u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:'));
  console.log('外网请求:', ext.length);
  console.log('起投记录:', await ev('JSON.stringify(window.__BR_TRAJ__.stats.shotLog.slice(0,8))'));
  ws.close();
}
main().then(() => { edge.kill(); process.exit(0); }).catch(e => { console.error('FAILED', e); edge.kill(); process.exit(1); });
