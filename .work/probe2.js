/* 聚焦探针：无限模式 / 运行时文字对象 / 画质控制点 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9335;
const FILE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(__dirname, 'edge-probe2'), '--no-first-run',
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
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(__dirname, 'p2-' + n + '.png'), Buffer.from(r.data, 'base64')); };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: FILE_URL });
  await wait(3500);
  await ev("localStorage.clear();location.reload();'ok'");
  await wait(8500);

  console.log('=== 1. 运行时对象与画质控制点（标准模式） ===');
  console.log(await ev(`(function(){
    var r=window.__BR_RUNTIME__;
    var out={dpr:window.devicePixelRatio,canvas:window.c3canvas?[window.c3canvas.width,window.c3canvas.height]:null,
      layout:window.__BR_STATE__.layout, hasObjects:!!(r&&r.objects)};
    try{out.objectKeys=r&&r.objects?Object.keys(r.objects).slice(0,90):[];}catch(e){out.objErr=String(e)}
    try{out.textLike=r&&r.objects?Object.keys(r.objects).filter(function(k){return /font|text|score|goal|ball/i.test(k)}):[];}catch(e){}
    try{var f=r&&r.objects&&r.objects.fontWonder;out.fontWonderType=f?typeof f:null;
      if(f&&f.getAllInstances){var a=f.getAllInstances();out.fontWonderCount=a.length;
        out.fontSample=a.slice(0,3).map(function(i){return {text:i.text,width:i.width,height:i.height,x:i.x,y:i.y,opacity:i.opacity,visible:typeof i.isVisible==='function'?i.isVisible():null};});}}catch(e){out.fontErr=String(e)}
    return JSON.stringify(out);
  })()`));

  console.log('\n=== 2. 标准模式调用 gameOver ===');
  console.log('call:', await ev(`(function(){try{var p=c3_callFunction('gameOver');if(p&&p.catch)p.catch(function(){});return 'called'}catch(e){return 'err '+e}})()`));
  await wait(1800);
  await shot('std-gameover');
  console.log('errors:', await ev('JSON.stringify(window.__GAME_ERRORS__||[])'));

  console.log('\n=== 3. 切到无限模式 ===');
  await ev(`(function(){var c=JSON.parse(localStorage.getItem('basketRandomOfflineSettings')||'{}');c.infinite=true;localStorage.setItem('basketRandomOfflineSettings',JSON.stringify(c));location.reload();return 'ok'})()`);
  await wait(8500);
  console.log(await ev(`JSON.stringify({infinite:window.__BR_STATE__.infinite,
    infiniteHits:(window.__GAME_ASSET_HITS__||{})['data.json.infinite']||0,
    dataHits:(window.__GAME_ASSET_HITS__||{})['data.json']||0,
    hasC3:!!window.C3,errors:window.__GAME_ERRORS__||[]})`));
  console.log('call gameOver in infinite:', await ev(`(function(){try{var p=c3_callFunction('gameOver');if(p&&p.catch)p.catch(function(){});return 'called'}catch(e){return 'err '+e}})()`));
  await wait(1800);
  await shot('inf-gameover');
  console.log('errors:', await ev('JSON.stringify(window.__GAME_ERRORS__||[])'));
  ws.close();
}
main().then(() => { edge.kill(); process.exit(0); }).catch(e => { console.error(e); edge.kill(); process.exit(1); });
