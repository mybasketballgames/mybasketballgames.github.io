/* 诊断：长按 12 秒期间「真正持球」出现多少次、每次持续多久 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9356;
const FILE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const PROFILE = path.join(__dirname, 'edge-holdstat');
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + PROFILE, '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--use-gl=angle',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=960,640', 'about:blank'],
  { stdio: 'ignore', windowsHide: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => http.get(u, r => { let s = ''; r.on('data', d => s += d); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }); }).on('error', rej));

const SAMPLE = `(function(){var s=window.__BR_TRAJ__.stats,b=window.__BR_TRAJ__.ballInfo();
  if(!b)return JSON.stringify({noball:true,i:s.shots});
  var en=null,imm=null;try{en=b.ph.isEnabled;imm=b.ph.isImmovable;}catch(e){}
  return JSON.stringify({t:Math.round(performance.now()),h:b.isHeld,hold:b.hold,who:b.who,en:en,imm:imm,y:+b.y.toFixed(1),i:s.shots});})()`;

async function main() {
  let t;
  for (let i = 0; i < 60; i++) { try { const l = await getJSON('http://127.0.0.1:' + PORT + '/json/list'); t = l.find(x => x.type === 'page'); if (t) break; } catch (e) {} await wait(300); }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const p = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { const q = p.get(m.id); p.delete(m.id); m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result); } };
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; p.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); return r.result && r.result.value; };
  const mouse = async (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
  const click = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); };
  const key = async (type, k, code, vk) => send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, ...(type === 'keyDown' && k.length === 1 ? { text: k, unmodifiedText: k } : {}) });

  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: FILE_URL });
  await wait(8000);
  for (let i = 0; i < 12; i++) {
    await click(934 * 0.36, 547 * 0.65); await wait(450);
    await click(480, 300); await wait(450);
    const vy = await ev("(function(){var b=window.__BR_TRAJ__.ballInfo();if(!b||!b.ph)return 0;try{return b.ph.getVelocityY()}catch(e){return 0}})()");
    if (Math.abs(vy) > 5) break;
  }
  await wait(500);
  await ev("(function(){var c=document.getElementById('c3-set-traj');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));var a=document.getElementById('br-auto');a.checked=true;a.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()");

  const rows = [];
  await key('keyDown', 'w', 'KeyW', 87);
  for (let i = 0; i < 200; i++) {
    const s = JSON.parse(await ev(SAMPLE));
    rows.push(s);
    await wait(50);
    if (i % 4 === 0) await key('keyDown', 'w', 'KeyW', 87);
  }
  await key('keyUp', 'w', 'KeyW', 87);

  const heldRows = rows.filter(r => r.h === true);
  // 连续持球段
  let runs = [], cur = null;
  rows.forEach(r => {
    if (r.h) { if (!cur) cur = { start: r.t, n: 0 }; cur.n++; cur.end = r.t; }
    else if (cur) { runs.push(cur); cur = null; }
  });
  if (cur) runs.push(cur);
  const shotRows = rows.filter((r, i) => i > 0 && r.i > rows[i - 1].i);
  console.log('总采样:', rows.length, '(≈50ms/次)');
  console.log('持球采样:', heldRows.length, '| 持球段数:', runs.length);
  console.log('持球段:', JSON.stringify(runs.map(r => ({ dur: (r.end - r.start) + 50, samples: r.n }))));
  console.log('\n起投次数:', shotRows.length);
  console.log('每次起投时是否持球:', JSON.stringify(shotRows.map(r => ({ h: r.h, hold: r.hold, en: r.en, y: r.y }))));
  console.log('起投次数（结束时）:', await ev('window.__BR_TRAJ__.stats.shots'),
    '| 命中:', await ev('window.__BR_TRAJ__.stats.hits'));
  ws.close();
}
main().then(() => { edge.kill(); process.exit(0); }).catch(e => { console.error('FAILED', e); edge.kill(); process.exit(1); });
