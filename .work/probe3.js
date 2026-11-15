/* 采样游戏内 SpriteFont 文本，摸清「每场开始前显示的是什么球」等文字 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9336;
const FILE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(__dirname, 'edge-probe3'), '--no-first-run',
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

  // 注入采样器：每次 tick 收集所有带 text 属性的实例文本
  await ev(`(function(){
    window.__TEXTS__={};
    var r=window.__BR_RUNTIME__;
    r.addEventListener('tick',function(){
      var names=Object.keys(r.objects||{});
      for(var i=0;i<names.length;i++){
        var o;try{o=r.objects[names[i]];}catch(e){continue}
        if(!o||!o.getAllInstances)continue;
        var a;try{a=o.getAllInstances();}catch(e){continue}
        for(var j=0;j<a.length;j++){
          var inst=a[j];
          if(inst&&typeof inst.text==='string'&&inst.text!==''){
            var k=names[i]+' :: '+inst.text;
            window.__TEXTS__[k]=(window.__TEXTS__[k]||0)+1;
          }
        }
      }
    });
    return 'sampler on';
  })()`);
  console.log('sampler:', await ev('Object.keys(window.__TEXTS__||{}).length'));

  await click(934 * 0.36, 547 * 0.65);
  await wait(3000);
  console.log('after 3s:', await ev('JSON.stringify(window.__TEXTS__||{})'));
  await wait(5000);
  console.log('after 8s:', await ev('JSON.stringify(window.__TEXTS__||{})'));
  // 模拟按键触发更多回合
  for (let i = 0; i < 8; i++) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
    await wait(400);
  }
  console.log('final:', await ev('JSON.stringify(window.__TEXTS__||{})'));
  ws.close();
}
main().then(() => { edge.kill(); process.exit(0); }).catch(e => { console.error(e); edge.kill(); process.exit(1); });
