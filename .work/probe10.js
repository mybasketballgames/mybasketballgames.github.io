/* 确认键盘事件送达 + 让回合真正开始，观察持球状态 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9351;
const FILE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(__dirname, 'edge-p10'), '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--use-gl=angle',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=960,640', 'about:blank'],
  { stdio: 'ignore', windowsHide: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => http.get(u, r => { let s = ''; r.on('data', d => s += d); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }); }).on('error', rej));

const SNAP = `(function(){
  var r=window.__BR_RUNTIME__,o={t:Math.round(performance.now()),layout:window.__BR_STATE__.layout,goal:r.globalVars.goal,
    p1:r.globalVars.P1Control,p2:r.globalVars.P2Control,keys:window.__kc||0,lastKey:window.__lastKey||null,focus:document.hasFocus()};
  o.ball=null;
  ['normalBall','heavyBall','kamesBall','smallBall'].forEach(function(n){
    var x=r.objects&&r.objects[n];if(!x||!x.getAllInstances)return;var a=[];try{a=x.getAllInstances();}catch(e){}
    if(a.length&&a[0]){
      var i=a[0],v={};['hold','who','which','handCollision'].forEach(function(k){try{v[k]=i.instVars[k];}catch(e){}});
      var ph=i.behaviors&&i.behaviors.Physics,p={};if(ph){try{p={imm:ph.isImmovable,en:ph.isEnabled,vx:+ph.getVelocityX().toFixed(1),vy:+ph.getVelocityY().toFixed(1)};}catch(e){}}
      o.ball={n:n,x:+i.x.toFixed(1),y:+i.y.toFixed(1),v:v,ph:p};
    }
  });
  o.arms=[];
  ['arm','arm2','arm3','arm4'].forEach(function(n){
    var x=r.objects&&r.objects[n];if(!x||!x.getAllInstances)return;var a=[];try{a=x.getAllInstances();}catch(e){}
    a.forEach(function(i){var v={};['have','ready'].forEach(function(k){try{v[k]=i.instVars[k];}catch(e){}});o.arms.push(n+':'+JSON.stringify(v)+'@'+i.x.toFixed(0)+','+i.y.toFixed(0));});
  });
  return JSON.stringify(o);
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
  const key = async (type, k, code, vk) => send('Input.dispatchKeyEvent', { type, key: k, code, text: type === 'keyDown' ? k : undefined, unmodifiedText: type === 'keyDown' ? k : undefined, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  const snap = async label => console.log(label.padEnd(20), await ev(SNAP));
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(__dirname, 'p10-' + n + '.png'), Buffer.from(r.data, 'base64')); };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: FILE_URL });
  await wait(8000);
  await ev("window.__kc=0;window.__lastKey=null;window.addEventListener('keydown',function(e){window.__kc++;window.__lastKey={key:e.key,code:e.code,trusted:e.isTrusted};},true);'ok'");
  await click(934 * 0.36, 547 * 0.65);
  await wait(2500);
  await snap('进入后');
  await shot('a-enter');

  await click(480, 300);   // 给画布焦点
  await wait(300);
  await key('keyDown', 'w', 'KeyW', 87);
  await wait(500);
  await snap('W按下0.5s');
  await wait(1200);
  await snap('W按住1.7s');
  await key('keyUp', 'w', 'KeyW', 87);
  await wait(900);
  await snap('W松开0.9s');
  await shot('b-afterW');

  // 再试空格 / 上箭头
  await key('keyDown', ' ', 'Space', 32); await wait(600); await key('keyUp', ' ', 'Space', 32);
  await wait(800);
  await snap('空格后');
  await key('keyDown', 'ArrowUp', 'ArrowUp', 38); await wait(600); await key('keyUp', 'ArrowUp', 'ArrowUp', 38);
  await wait(800);
  await snap('↑后');
  await shot('c-afterKeys');
  ws.close();
}
main().then(() => { edge.kill(); process.exit(0); }).catch(e => { console.error('FAILED', e); edge.kill(); process.exit(1); });
