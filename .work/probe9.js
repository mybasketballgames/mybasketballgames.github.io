/* 探测「球在手上」的真实状态：球 instVars.hold/who + 手臂 have/ready */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9350;
const FILE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(__dirname, 'edge-p9'), '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--use-gl=angle',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=960,640', 'about:blank'],
  { stdio: 'ignore', windowsHide: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => http.get(u, r => { let s = ''; r.on('data', d => s += d); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }); }).on('error', rej));

const SNAP = `(function(){
  var r=window.__BR_RUNTIME__, out={t:Math.round(performance.now())};
  function iv(i,keys){var d={};keys.forEach(function(k){try{d[k]=i.instVars[k];}catch(e){d[k]='ERR';}});return d;}
  out.globals={};
  try{Object.keys(r.globalVars||{}).forEach(function(k){var v=r.globalVars[k];if(typeof v!=='object')out.globals[k]=v;});}catch(e){}
  out.balls=[];
  ['normalBall','heavyBall','kamesBall','smallBall','balls','ballLine','ballCol'].forEach(function(n){
    var o=r.objects&&r.objects[n]; if(!o||!o.getAllInstances)return;
    var a=[];try{a=o.getAllInstances();}catch(e){}
    a.forEach(function(i,idx){
      var d={n:n,idx:idx,x:+i.x.toFixed(1),y:+i.y.toFixed(1)};
      d.vars=iv(i,['which','hold','who','tail','handCollision','have','ready']);
      try{d.anim=i.animationName;}catch(e){}
      var ph=i.behaviors&&i.behaviors.Physics;
      if(ph){try{d.ph={imm:ph.isImmovable,en:ph.isEnabled,vx:+ph.getVelocityX().toFixed(1),vy:+ph.getVelocityY().toFixed(1)};}catch(e){}}
      out.balls.push(d);
    });
  });
  out.arms=[];
  ['arm','arm2','arm3','arm4','armBiz','handCollision','handCollision2','handCollision3','handCollision4'].forEach(function(n){
    var o=r.objects&&r.objects[n]; if(!o||!o.getAllInstances)return;
    var a=[];try{a=o.getAllInstances();}catch(e){}
    a.forEach(function(i,idx){out.arms.push({n:n,idx:idx,x:+i.x.toFixed(1),y:+i.y.toFixed(1),vars:iv(i,['which','have','ready'])});});
  });
  return JSON.stringify(out);
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
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  const key = async (type, k, code, vk) => send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: FILE_URL });
  await wait(8000);
  await click(934 * 0.36, 547 * 0.65);
  await wait(2500);

  const samples = [];
  samples.push(['进入对局静止', await ev(SNAP)]);
  await key('keyDown', 'w', 'KeyW', 87);
  await wait(400);
  samples.push(['按下W 0.4s', await ev(SNAP)]);
  await wait(700);
  samples.push(['按住W 1.1s', await ev(SNAP)]);
  await wait(900);
  samples.push(['按住W 2.0s', await ev(SNAP)]);
  await key('keyUp', 'w', 'KeyW', 87);
  await wait(500);
  samples.push(['松开W 0.5s', await ev(SNAP)]);
  await wait(1500);
  samples.push(['松开W 2.0s', await ev(SNAP)]);

  samples.forEach(function (s) {
    let j; try { j = JSON.parse(s[1]); } catch (e) { console.log(s[0], 'PARSE FAIL', s[1]); return; }
    console.log('\n===== ' + s[0] + ' (t=' + j.t + ') =====');
    console.log(' globals:', JSON.stringify(j.globals));
    console.log(' balls:');
    (j.balls || []).forEach(function (b) { console.log('   ', b.n, b.idx, 'xy=' + b.x + ',' + b.y, 'vars=' + JSON.stringify(b.vars), 'anim=' + b.anim, b.ph ? 'ph=' + JSON.stringify(b.ph) : ''); });
    console.log(' arms/hands:');
    (j.arms || []).forEach(function (b) { console.log('   ', b.n, b.idx, 'xy=' + b.x + ',' + b.y, JSON.stringify(b.vars)); });
  });
  ws.close();
}
main().then(() => { edge.kill(); process.exit(0); }).catch(e => { console.error('FAILED', e); edge.kill(); process.exit(1); });
