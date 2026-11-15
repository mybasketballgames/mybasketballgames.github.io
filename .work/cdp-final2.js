/* 验证：菜单拖动/关闭、抛物线辅助、自动投篮进球 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9343;
const FILE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(__dirname, 'edge-f2'), '--no-first-run',
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
  let id = 0; const p = new Map(); const errors = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && p.has(m.id)) { const q = p.get(m.id); p.delete(m.id); m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION ' + (m.params.exceptionDetails.text || ''));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push((m.params.args || []).map(a => a.value || a.description || '').join(' ').slice(0, 140));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; p.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); return r.result && r.result.value; };
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(__dirname, 'f2-' + n + '.png'), Buffer.from(r.data, 'base64')); };
  const mouse = async (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
  const click = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); };
  const key = async (type, k, code, vk, mods) => send('Input.dispatchKeyEvent', { type, modifiers: mods || 0, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });

  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: FILE_URL });
  await wait(8000);
  await click(934 * 0.36, 547 * 0.65);
  await wait(2500);

  console.log('=== 1 打开菜单 / 拖动修复 ===');
  await key('keyDown', '6', 'Digit6', 54, 1); await key('keyUp', '6', 'Digit6', 54, 1);
  await wait(500);
  console.log('open:', await ev('window.__BR_ADMIN__.open'));
  var tr = await ev("(function(){var r=document.getElementById('br-admin-title').getBoundingClientRect();return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height})})()");
  var r0 = JSON.parse(tr);
  await mouse('mouseMoved', r0.x + 60, r0.y + 12);
  await mouse('mousePressed', r0.x + 60, r0.y + 12);
  await mouse('mouseMoved', r0.x + 160, r0.y + 90);
  await mouse('mouseReleased', r0.x + 160, r0.y + 90);
  await wait(200);
  var left1 = await ev("document.getElementById('br-admin-panel').style.left");
  await mouse('mouseMoved', 500, 400);   // 松手后再移动，不应继续跟随
  await wait(200);
  var left2 = await ev("document.getElementById('br-admin-panel').style.left");
  console.log('拖动后 left:', left1, '| 松手后再移动 left:', left2, '| 已停止跟随:', left1 === left2);

  console.log('\n=== 2 关闭方式 ===');
  await ev("window.__BR_ADMIN__.setOpen(true)");
  await ev("document.getElementById('br-admin-close').click()");
  console.log('× 关闭:', await ev('window.__BR_ADMIN__.open'));
  await ev("window.__BR_ADMIN__.setOpen(true)");
  await key('keyDown', 'Escape', 'Escape', 27); await key('keyUp', 'Escape', 'Escape', 27);
  await wait(200);
  console.log('Esc 关闭:', await ev('window.__BR_ADMIN__.open'));
  await key('keyDown', '6', 'Digit6', 54, 1); await key('keyUp', '6', 'Digit6', 54, 1);
  await wait(200);
  console.log('Alt+6 再开:', await ev('window.__BR_ADMIN__.open'));

  console.log('\n=== 3 抛物线辅助（长按 W） ===');
  await ev("(function(){var c=document.getElementById('c3-set-traj');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()");
  await key('keyDown', 'w', 'KeyW', 87);
  await wait(900);
  var px = await ev(`(function(){var c=document.getElementById('br-traj-canvas');var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;var n=0;for(var i=3;i<d.length;i+=4)if(d[i]>0)n++;return n})()`);
  console.log('抛物线非透明像素:', px, '(>0 表示已绘制)');
  console.log('  按住时 held:', await ev('JSON.stringify(Object.keys(window.__BR_TRAJ__.held))'));
  await shot('1-trajectory');
  await key('keyUp', 'w', 'KeyW', 87);
  await wait(300);
  console.log('  松开后 held:', await ev('JSON.stringify(Object.keys(window.__BR_TRAJ__.held))'));
  var px2 = await ev(`(function(){var c=document.getElementById('br-traj-canvas');var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;var n=0;for(var i=3;i<d.length;i+=4)if(d[i]>0)n++;return n})()`);
  console.log('松开后像素:', px2, '(应为 0)');

  console.log('\n=== 4 彩蛋：连点「数据线」3 次 ===');
  await ev("document.getElementById('br-admin-close').click()");
  await ev("document.getElementById('c3-set-btn').click()");
  for (var q = 0; q < 3; q++) await ev("document.getElementById('c3-set-brand').click()");
  await wait(300);
  console.log('三击后菜单 open:', await ev('window.__BR_ADMIN__.open'));

  console.log('\n=== 5 长按触发自瞄 ===');
  var before = await ev('JSON.stringify({p1:window.__BR_GLOBALVARS__.p1Score,p2:window.__BR_GLOBALVARS__.p2Score})');
  console.log('开启前比分:', before);
  await ev("(function(){var c=document.getElementById('br-auto');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()");
  await wait(400);
  console.log('未长按时 active:', await ev('window.__BR_TRAJ__.stats.active'));
  // 模拟真实长按：浏览器会持续 auto-repeat 派发 keydown
  await key('keyDown', 'w', 'KeyW', 87);
  for (var k = 0; k < 14; k++) {
    await wait(800); await key('keyDown', 'w', 'KeyW', 87);
    if (k === 7) console.log('长按过程中 active:', await ev('window.__BR_TRAJ__.stats.active'));
  }
  await key('keyUp', 'w', 'KeyW', 87);
  console.log('弹道诊断:', await ev('JSON.stringify(window.__BR_TRAJ__.stats)'));
  console.log('松开后 active:', await ev('window.__BR_TRAJ__.stats.active'));
  console.log('开启后比分:', await ev('JSON.stringify({p1:window.__BR_GLOBALVARS__.p1Score,p2:window.__BR_GLOBALVARS__.p2Score})'));
  await shot('2-autoshot');
  console.log('\n错误:', errors.length, errors.slice(0, 5));
  console.log('游戏错误:', await ev('JSON.stringify(window.__GAME_ERRORS__||[])'));
  ws.close();
}
main().then(() => { edge.kill(); process.exit(0); }).catch(e => { console.error('FAILED', e); edge.kill(); process.exit(1); });
