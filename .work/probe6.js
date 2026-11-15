/* 探测 Physics 行为脚本接口，用于弹道预测与自动投篮 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9342;
const FILE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(__dirname, 'edge-p6'), '--no-first-run',
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
  let id = 0; const p = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { const q = p.get(m.id); p.delete(m.id); m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result); } };
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; p.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); return r.result && r.result.value; };
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: FILE_URL });
  await wait(8000);
  await click(934 * 0.36, 547 * 0.65);
  await wait(2500);

  console.log('=== 球实例接口 ===');
  console.log(await ev(`(function(){
    var r=window.__BR_RUNTIME__, out={};
    var o=r.objects['normalBall'];
    var arr=o&&o.getAllInstances?o.getAllInstances():[];
    out.count=arr.length;
    out.ballLineCount=(r.objects['ballLine']&&r.objects['ballLine'].getAllInstances)?r.objects['ballLine'].getAllInstances().length:-1;
    var i=arr[0];
    if(!i) return JSON.stringify(out);
    out.proto=Object.getOwnPropertyNames(Object.getPrototypeOf(i)).slice(0,90);
    out.own=Object.keys(i).slice(0,40);
    ['physics','behaviors','behavior','Physics'].forEach(function(k){try{out[k]=typeof i[k];}catch(e){out[k]='err'}});
    try{out.behaviorKeys=i.behaviors?Object.keys(i.behaviors):null;}catch(e){}
    var ph=i.behaviors&&i.behaviors.Physics ? i.behaviors.Physics : (i.physics||null);
    if(ph){
      out.phProto=Object.getOwnPropertyNames(Object.getPrototypeOf(ph)).slice(0,90);
      out.phOwn=Object.keys(ph).slice(0,40);
      ['velocityX','velocityY','gravity','mass','angularVelocity','isEnabled'].forEach(function(k){
        try{out['ph_'+k]=ph[k];}catch(e){out['ph_'+k]='err'}
      });
    }
    return JSON.stringify(out)})()`));
  ws.close();
}
main().then(() => { edge.kill(); process.exit(0); }).catch(e => { console.error(e); edge.kill(); process.exit(1); });
