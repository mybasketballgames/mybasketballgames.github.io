/* 决定性实验：把球从上方逐步送过得分区，确认得分触发条件 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9345;
const FILE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(__dirname, 'edge-p8'), '--no-first-run',
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
  const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + JSON.stringify(r.exceptionDetails).slice(0, 300); return r.result && r.result.value; };
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  const key = async (type, k, code, vk) => send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: FILE_URL });
  await wait(8000);
  await click(934 * 0.36, 547 * 0.65);
  await wait(2200);
  // 先按一次 W 开球
  await key('keyDown', 'w', 'KeyW', 87); await wait(80); await key('keyUp', 'w', 'KeyW', 87);
  await wait(600);

  console.log('初始:', await ev(`(function(){var g=window.__BR_GLOBALVARS__;return JSON.stringify({p1:g.p1Score,p2:g.p2Score,goal:g.goal})})()`));

  console.log('\n=== 实验 A：teleport 从上方穿过右得分区 ===');
  console.log(await ev(`(async function(){
    var r=window.__BR_RUNTIME__,g=window.__BR_GLOBALVARS__;
    var b=r.objects.normalBall.getAllInstances()[0],ph=b.behaviors.Physics;
    try{ph.isImmovable=false;}catch(e){}
    var log=[];
    for(var y=50;y<=105;y+=5){
      try{ph.teleport(234,y);}catch(e){log.push('err '+e)}
      await new Promise(function(res){setTimeout(res,50)});
    }
    await new Promise(function(res){setTimeout(res,500)});
    return JSON.stringify({p1:g.p1Score,p2:g.p2Score,goal:g.goal,ball:b.x.toFixed(1)+','+b.y.toFixed(1),log:log});
  })()`));

  console.log('\n=== 实验 B：teleport 穿过左得分区 ===');
  console.log(await ev(`(async function(){
    var r=window.__BR_RUNTIME__,g=window.__BR_GLOBALVARS__;
    var b=r.objects.normalBall.getAllInstances()[0],ph=b.behaviors.Physics;
    var log=[];
    for(var y=50;y<=105;y+=5){
      try{ph.teleport(56,y);}catch(e){log.push('err '+e)}
      await new Promise(function(res){setTimeout(res,50)});
    }
    await new Promise(function(res){setTimeout(res,500)});
    return JSON.stringify({p1:g.p1Score,p2:g.p2Score,goal:g.goal,ball:b.x.toFixed(1)+','+b.y.toFixed(1)});
  })()`));

  console.log('\n=== 参考：得分区与球对象位置 ===');
  console.log(await ev(`(function(){var r=window.__BR_RUNTIME__;var out={};
    ['scoreCollision','potaCollision','ballLine','ballCol','normalBall'].forEach(function(n){
      out[n]=r.objects[n].getAllInstances().map(function(i){return {x:i.x.toFixed(1),y:i.y.toFixed(1),w:i.width,h:i.height,vis:i.isVisible?i.isVisible():null}});
    });return JSON.stringify(out)})()`));
  ws.close();
}
main().then(() => { edge.kill(); process.exit(0); }).catch(e => { console.error(e); edge.kill(); process.exit(1); });
