/* 探测 C3 运行时坐标转换 API 与关键对象实例，供管理员菜单绘制使用 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9340;
const FILE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(__dirname, 'edge-p5'), '--no-first-run',
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

  console.log('=== canvas 尺寸 ===');
  console.log(await ev(`(function(){var c=window.c3canvas,r=c.getBoundingClientRect();
    return JSON.stringify({w:c.width,h:c.height,css:[r.width,r.height],rect:[r.left,r.top],dpr:devicePixelRatio})})()`));

  console.log('\n=== runtime.viewport API ===');
  console.log(await ev(`(function(){var r=window.__BR_RUNTIME__,out={};
    try{var v=r.viewport;out.type=typeof v;out.keys=v?Object.keys(v).slice(0,30):[];
      out.proto=v?Object.getOwnPropertyNames(Object.getPrototypeOf(v)).slice(0,60):[];
      out.values={};['width','height','_width','_height','scale','_scale','offsetX','offsetY'].forEach(function(k){try{out.values[k]=v[k];}catch(e){}});}
    catch(e){out.err=String(e)}
    return JSON.stringify(out)})()`));

  console.log('\n=== layer API ===');
  console.log(await ev(`(function(){var r=window.__BR_RUNTIME__,out={};
    try{var l=r.getMainRunningLayout();out.layoutType=typeof l;
      out.layoutProto=l?Object.getOwnPropertyNames(Object.getPrototypeOf(l)).slice(0,50):[];
      var lay=l&&l.getLayer?l.getLayer(0):null;
      out.layerType=typeof lay;
      out.layerProto=lay?Object.getOwnPropertyNames(Object.getPrototypeOf(lay)).slice(0,70):[];
      if(lay&&lay.layerToCanvas){var q=lay.layerToCanvas(145,130);out.layerToCanvas=JSON.stringify(q);}
    }catch(e){out.err=String(e)}
    return JSON.stringify(out)})()`));

  console.log('\n=== 关键对象实例（进入对局后） ===');
  console.log(await ev(`(function(){var r=window.__BR_RUNTIME__,out={};
    var names=['ballLine','normalBall','heavyBall','kamesBall','smallBall','ballShadow','ballCol',
      'head','head2','head3','head4','body','body2','body3','body4','arm','arm2','arm3','arm4',
      'p1Collision','p2Collision','p3Collision','p4Collision','handCollision','handCollision2','handCollision3','handCollision4',
      'scoreCollision','potaCollision','potaBack','potaFile','scoreBG','fontWonder','tutorial','title','startButton'];
    names.forEach(function(n){
      var o=r.objects&&r.objects[n]; if(!o||!o.getAllInstances){out[n]=null;return;}
      var a=o.getAllInstances();
      out[n]=a.slice(0,5).map(function(i){
        var d={x:Math.round(i.x*10)/10,y:Math.round(i.y*10)/10,w:Math.round((i.width||0)*10)/10,h:Math.round((i.height||0)*10)/10};
        try{d.vis=i.isVisible();}catch(e){}
        try{d.anim=i.animationName;}catch(e){}
        try{d.which=i.instVars['which'];}catch(e){}
        return d;
      });
    });
    return JSON.stringify(out)})()`));
  ws.close();
}
main().then(() => { edge.kill(); process.exit(0); }).catch(e => { console.error(e); edge.kill(); process.exit(1); });
