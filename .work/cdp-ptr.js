/* 诊断：mousePressed 是否产生 pointerdown，以及 canvas 命中判断 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9358;
const FILE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const PROFILE = path.join(__dirname, 'edge-ptr');
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + PROFILE, '--no-first-run',
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
  const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) console.log('EVAL ERR:', r.exceptionDetails.text); return r.result && r.result.value; };
  const mouse = async (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'mouse' });
  const click = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: FILE_URL });
  await wait(8000);
  await click(934 * 0.36, 547 * 0.65); await wait(1500);
  await click(480, 300); await wait(800);

  console.log('c3canvas:', await ev("(function(){var c=window.c3canvas||document.getElementById('c3canvas');if(!c)return 'NONE';var r=c.getBoundingClientRect();return JSON.stringify({id:c.id,tag:c.tagName,x:r.left,y:r.top,w:r.width,h:r.height})})()"));
  console.log('elementFromPoint(300,330):', await ev("(function(){var e=document.elementFromPoint(300,330);return e?(e.id||e.tagName)+'.'+(e.className||''):'NONE'})()"));

  await ev("window.__PT__=[];['pointerdown','mousedown','touchstart','pointerup','mouseup'].forEach(function(t){window.addEventListener(t,function(e){window.__PT__.push({t:t,tgt:(e.target&&(e.target.id||e.target.tagName))||'-',pid:e.pointerId,btn:e.button});},true);});'ok'");
  await mouse('mousePressed', 300, 330);
  await wait(300);
  console.log('按下后事件:', await ev('JSON.stringify(window.__PT__)'));
  await mouse('mouseReleased', 300, 330);
  await wait(200);

  // 再试触摸
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await ev("window.__PT__=[];'ok'");
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 330, id: 1 }] });
  await wait(300);
  console.log('触摸按下后事件:', await ev('JSON.stringify(window.__PT__)'));
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  ws.close();
}
main().then(() => { edge.kill(); process.exit(0); }).catch(e => { console.error('FAILED', e); edge.kill(); process.exit(1); });
