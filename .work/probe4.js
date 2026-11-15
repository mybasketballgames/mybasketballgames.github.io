/* 找出真正区分球类型的运行时状态 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9338;
const FILE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(__dirname, 'edge-p4'), '--no-first-run',
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

  const expr = `(function(){
    var r=window.__BR_RUNTIME__, out={};
    function info(name){
      var o=r.objects&&r.objects[name];
      if(!o||!o.getAllInstances)return null;
      var a=o.getAllInstances();
      return {count:a.length, items:a.slice(0,4).map(function(i){
        var d={};
        ['animationName','opacity','visible','isVisible','width','height','x','y','text'].forEach(function(k){
          try{ if(typeof i[k]==='function') d[k]=i[k](); else d[k]=i[k]; }catch(e){}
        });
        try{ d.instVars={}; ['which','tin','who','hold','tail'].forEach(function(k){ try{d.instVars[k]=i.instVars[k];}catch(e){} }); }catch(e){}
        return d;
      })};
    }
    ['heavyBall','normalBall','kamesBall','smallBall','ballLine','balls','font','fontWonder','scoreBG','basketText','tutorial'].forEach(function(n){out[n]=info(n);});
    return JSON.stringify(out);
  })()`;
  console.log('=== 对象状态 ===');
  console.log(await ev(expr));

  // 尝试找出含有球类型编号的全局变量/实例变量
  console.log('\n=== 全局变量快照 ===');
  console.log(await ev('JSON.stringify(window.__BR_GLOBALVARS__)'));
  ws.close();
}
main().then(() => { edge.kill(); process.exit(0); }).catch(e => { console.error(e); edge.kill(); process.exit(1); });
