/* 实验：把球送到手部碰撞体位置，能否触发游戏自身的持球状态 hold=1 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9359;
const FILE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const PROFILE = path.join(__dirname, 'edge-p12');
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + PROFILE, '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--use-gl=angle',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=960,640', 'about:blank'],
  { stdio: 'ignore', windowsHide: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => http.get(u, r => { let s = ''; r.on('data', d => s += d); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }); }).on('error', rej));

const STATE = `(function(){var b=window.__BR_TRAJ__.ballInfo();if(!b)return JSON.stringify({err:'noball'});
  return JSON.stringify({x:+b.x.toFixed(1),y:+b.y.toFixed(1),held:b.isHeld,hold:b.hold,who:b.who,hc:b.handCollision,en:b.ph?b.ph.isEnabled:null});})()`;

async function main() {
  let t;
  for (let i = 0; i < 60; i++) { try { const l = await getJSON('http://127.0.0.1:' + PORT + '/json/list'); t = l.find(x => x.type === 'page'); if (t) break; } catch (e) {} await wait(300); }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const p = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { const q = p.get(m.id); p.delete(m.id); m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result); } };
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; p.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) console.log('EVAL ERR', r.exceptionDetails.text); return r.result && r.result.value; };
  const mouse = async (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
  const click = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: FILE_URL });
  await wait(8000);
  for (let i = 0; i < 12; i++) {
    await click(934 * 0.36, 547 * 0.65); await wait(450);
    await click(480, 300); await wait(450);
    const vy = await ev("(function(){var b=window.__BR_TRAJ__.ballInfo();if(!b||!b.ph)return 0;try{return b.ph.getVelocityY()}catch(e){return 0}})()");
    if (Math.abs(vy) > 5) break;
  }
  await wait(800);
  console.log('手部位置:', await ev("(function(){var r=window.__BR_RUNTIME__,o={};['handCollision3','handCollision4','handCollision','handCollision2'].forEach(function(n){var a=r.objects[n]&&r.objects[n].getAllInstances?r.objects[n].getAllInstances():[];if(a[0])o[n]=[+a[0].x.toFixed(1),+a[0].y.toFixed(1)];});return JSON.stringify(o)})()"));
  console.log('初始:', await ev(STATE));

  console.log('\n=== 试 1：放到 handCollision3 正中，速度 0 ===');
  console.log(await ev(`(function(){var r=window.__BR_RUNTIME__,h=r.objects.handCollision3.getAllInstances()[0];
    var b=window.__BR_TRAJ__.ballInfo();b.ph.isEnabled=true;b.ph.isImmovable=false;
    b.ph.teleport(h.x,h.y);b.ph.setVelocity(0,0);return 'sent to '+h.x.toFixed(1)+','+h.y.toFixed(1)})()`));
  await wait(250); console.log('0.25s:', await ev(STATE));
  await wait(400); console.log('0.65s:', await ev(STATE));

  console.log('\n=== 试 2：放到手上方 12px，给 60 速度下落 ===');
  console.log(await ev(`(function(){var r=window.__BR_RUNTIME__,h=r.objects.handCollision3.getAllInstances()[0];
    var b=window.__BR_TRAJ__.ballInfo();b.ph.isEnabled=true;b.ph.isImmovable=false;
    b.ph.teleport(h.x,h.y-12);b.ph.setVelocity(0,60);return 'ok'})()`));
  await wait(250); console.log('0.25s:', await ev(STATE));
  await wait(400); console.log('0.65s:', await ev(STATE));

  console.log('\n=== 试 3：放到球员头顶（p3Collision 上方 40px），速度 0 ===');
  console.log(await ev(`(function(){var r=window.__BR_RUNTIME__,c=r.objects.p3Collision.getAllInstances()[0];
    var b=window.__BR_TRAJ__.ballInfo();b.ph.isEnabled=true;b.ph.isImmovable=false;
    b.ph.teleport(c.x,c.y-40);b.ph.setVelocity(0,0);return 'ok'})()`));
  for (let i = 0; i < 6; i++) { await wait(200); console.log((0.2 * (i + 1)).toFixed(1) + 's:', await ev(STATE)); }
  ws.close();
}
main().then(() => { edge.kill(); process.exit(0); }).catch(e => { console.error('FAILED', e); edge.kill(); process.exit(1); });
