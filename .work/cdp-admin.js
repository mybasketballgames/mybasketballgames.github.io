/* 验证管理员菜单：Alt+6、绘制层、自瞄自动按键、无异常 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9341;
const FILE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(__dirname, 'edge-admin'), '--no-first-run',
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
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push((m.params.args || []).map(a => a.value || a.description || '').join(' ').slice(0, 150));
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; p.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); return r.result && r.result.value; };
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(__dirname, 'admin-' + n + '.png'), Buffer.from(r.data, 'base64')); };
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: FILE_URL });
  await wait(8000);
  await click(934 * 0.36, 547 * 0.65);
  await wait(2600);
  console.log('菜单初始隐藏:', await ev("document.getElementById('br-admin-root').hidden"));

  // Alt+6
  await send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 1, key: '6', code: 'Digit6', windowsVirtualKeyCode: 54, nativeVirtualKeyCode: 54 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 1, key: '6', code: 'Digit6', windowsVirtualKeyCode: 54, nativeVirtualKeyCode: 54 });
  await wait(1400);
  console.log('Alt+6 后 open =', await ev('window.__BR_ADMIN__.open'), '| root.hidden =', await ev("document.getElementById('br-admin-root').hidden"));
  console.log('覆盖 canvas:', await ev(`(function(){var c=document.getElementById('br-admin-canvas');return JSON.stringify({w:c.width,h:c.height,css:[c.style.width,c.style.height]})})()`));
  console.log('状态栏:', JSON.stringify(await ev("document.getElementById('br-status').textContent")));
  await shot('1-overlay');

  // 只开方框，便于校准
  await ev("(function(){['skel','dist','label','aimline'].forEach(function(k){var e=document.getElementById('br-'+k);e.checked=false;e.dispatchEvent(new Event('change',{bubbles:true}))});return 'ok'})()");
  await wait(800);
  await shot('2-boxes-only');

  // 自瞄辅助：同时确认合成键盘事件真的到达 document（C3 键盘插件监听处）
  await ev("window.__keySeen=0;document.addEventListener('keydown',function(){window.__keySeen++});'ok'");
  await ev("(function(){var e=document.getElementById('br-auto');e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}));var r=document.getElementById('br-range');r.value=200;r.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()");
  await wait(3500);
  console.log('自动按键次数:', await ev('window.__BR_ADMIN__.stats.keys'),
    '| document 收到 keydown:', await ev('window.__keySeen'),
    '| 目标:', await ev('window.__BR_ADMIN__.stats.target'),
    '| 距离:', await ev('window.__BR_ADMIN__.stats.lastDist.toFixed(1)'));
  console.log('配置:', await ev('JSON.stringify(window.__BR_ADMIN__.cfg)'));

  // 再按 Alt+6 关闭
  await send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 1, key: '6', code: 'Digit6', windowsVirtualKeyCode: 54 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 1, key: '6', code: 'Digit6', windowsVirtualKeyCode: 54 });
  await wait(400);
  console.log('再次 Alt+6 后 open =', await ev('window.__BR_ADMIN__.open'));
  console.log('错误:', errors.length, errors.slice(0, 5));
  console.log('游戏错误:', await ev('JSON.stringify(window.__GAME_ERRORS__||[])'));
  ws.close();
}
main().then(() => { edge.kill(); process.exit(0); }).catch(e => { console.error('FAILED', e); edge.kill(); process.exit(1); });
