/* 实验：球在手上时如何「松手」并接管物理，让 teleport 生效 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9352;
const FILE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(__dirname, 'edge-p11'), '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--use-gl=angle',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=960,640', 'about:blank'],
  { stdio: 'ignore', windowsHide: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => http.get(u, r => { let s = ''; r.on('data', d => s += d); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }); }).on('error', rej));

const GET = `(function(){
  var r=window.__BR_RUNTIME__,o=r.objects.normalBall,a=o.getAllInstances(),i=a[0];
  if(!i)return JSON.stringify({err:'no ball'});
  var v={};['hold','who','handCollision'].forEach(function(k){try{v[k]=i.instVars[k]}catch(e){}});
  var ph=i.behaviors.Physics,p={};try{p={en:ph.isEnabled,imm:ph.isImmovable,vx:+ph.getVelocityX().toFixed(1),vy:+ph.getVelocityY().toFixed(1)}}catch(e){}
  var arms={};['arm','arm2','arm3','arm4'].forEach(function(n){var x=r.objects[n],b=x&&x.getAllInstances?x.getAllInstances():[];if(b[0]){try{arms[n]=b[0].instVars.have}catch(e){}}});
  return JSON.stringify({x:+i.x.toFixed(1),y:+i.y.toFixed(1),v:v,ph:p,arms:arms,goal:r.globalVars.goal});
})()`;

const RELEASE = `(function(){
  var r=window.__BR_RUNTIME__,i=r.objects.normalBall.getAllInstances()[0];
  var v=i.instVars,who=v.who,ph=i.behaviors.Physics,log={who:who};
  var names={1:'arm',2:'arm2',3:'arm3',4:'arm4'};
  try{ if(names[who]){var ai=r.objects[names[who]].getAllInstances()[0]; if(ai){log.armBefore=ai.instVars.have;ai.instVars.have=0;log.armAfter=ai.instVars.have;}} }catch(e){log.armErr=String(e)}
  try{log.holdBefore=v.hold;v.hold=0;v.handCollision=0;v.who=-1;log.holdAfter=v.hold;}catch(e){log.varErr=String(e)}
  try{log.enBefore=ph.isEnabled;ph.isEnabled=true;ph.isImmovable=false;log.enAfter=ph.isEnabled;}catch(e){log.phErr=String(e)}
  try{ph.teleport(205,42);ph.setVelocity(0,0);log.tp='ok';}catch(e){log.tpErr=String(e)}
  return JSON.stringify(log);
})()`;

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
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: FILE_URL });
  await wait(8000);
  await click(934 * 0.36, 547 * 0.65);
  await wait(2200);
  await click(480, 300);
  console.log('起始:', await ev(GET));

  let held = null;
  for (let k = 0; k < 40; k++) {
    const s = await ev(GET);
    const j = JSON.parse(s);
    if (j.v && j.v.hold === 1) { held = j; break; }
    await wait(300);
  }
  console.log('捕获持球:', held ? JSON.stringify(held) : '12 秒内没抓到球');
  if (!held) { ws.close(); return; }
  console.log('释放操作:', await ev(RELEASE));
  await wait(300);
  console.log('0.3s 后:', await ev(GET));
  await wait(600);
  console.log('0.9s 后:', await ev(GET));
  await wait(900);
  console.log('1.8s 后:', await ev(GET));
  ws.close();
}
main().then(() => { edge.kill(); process.exit(0); }).catch(e => { console.error('FAILED', e); edge.kill(); process.exit(1); });
