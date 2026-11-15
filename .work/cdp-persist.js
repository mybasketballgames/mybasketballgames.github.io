/* 验证：关闭管理员菜单面板后，绘制层与自瞄等功能仍持续运行 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9354;
const FILE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const PROFILE = path.join(__dirname, 'edge-persist');
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}  // 全新配置，验证首次启动
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + PROFILE, '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--use-gl=angle',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=960,640', 'about:blank'],
  { stdio: 'ignore', windowsHide: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => http.get(u, r => { let s = ''; r.on('data', d => s += d); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }); }).on('error', rej));

const PIX = "(function(){var c=document.getElementById('br-admin-canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,n=0;for(var i=3;i<d.length;i+=4)if(d[i]>0)n++;return n})()";
const HASH = "(function(){var c=document.getElementById('br-admin-canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,h=0;for(var i=3;i<d.length;i+=40)h=(h*31+d[i])|0;return h})()";

async function main() {
  let t;
  for (let i = 0; i < 60; i++) { try { const l = await getJSON('http://127.0.0.1:' + PORT + '/json/list'); t = l.find(x => x.type === 'page'); if (t) break; } catch (e) {} await wait(300); }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const p = new Map(); const errors = []; const requests = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && p.has(m.id)) { const q = p.get(m.id); p.delete(m.id); m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION ' + (m.params.exceptionDetails.text || ''));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push((m.params.args || []).map(a => a.value || a.description || '').join(' ').slice(0, 140));
    if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; p.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) console.log('EVAL ERR:', r.exceptionDetails.text); return r.result && r.result.value; };
  const mouse = async (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
  const click = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); };
  const key = async (type, k, code, vk, mods) => {
    const one = k.length === 1;
    return send('Input.dispatchKeyEvent', Object.assign({ type, key: k, code, modifiers: mods || 0, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk },
      type === 'keyDown' && one ? { text: k, unmodifiedText: k } : {}));
  };
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(__dirname, 'persist-' + n + '.png'), Buffer.from(r.data, 'base64')); };

  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Page.navigate', { url: FILE_URL });
  await wait(8000);
  for (let i = 0; i < 10; i++) {
    await click(934 * 0.36, 547 * 0.65); await wait(450);
    await click(480, 300); await wait(450);
    const vy = await ev("(function(){var b=window.__BR_TRAJ__.ballInfo();if(!b||!b.ph)return 0;try{return b.ph.getVelocityY()}catch(e){return 0}})()");
    if (Math.abs(vy) > 5) break;
  }
  await wait(700);

  console.log('=== 1 启动画面保持干净 ===');
  console.log('everOpened:', await ev('window.__BR_ADMIN__.cfg.everOpened'),
    '| 面板 hidden:', await ev("document.getElementById('br-admin-root').hidden"),
    '| 绘制像素:', await ev(PIX));
  console.log('canvas 是否仍在 root 内（应为 false）:',
    await ev("document.getElementById('br-admin-root').contains(document.getElementById('br-admin-canvas'))"));

  console.log('\n=== 2 按 Alt+6 打开菜单 ===');
  await key('keyDown', '6', 'Digit6', 54, 1); await key('keyUp', '6', 'Digit6', 54, 1);
  await wait(700);
  console.log('open:', await ev('window.__BR_ADMIN__.open'),
    '| everOpened:', await ev('window.__BR_ADMIN__.cfg.everOpened'),
    '| 绘制像素:', await ev(PIX),
    '| 总开关:', await ev("document.getElementById('br-overlay').checked"));
  await shot('1-menu-open');

  console.log('\n=== 3 开启自瞄后关闭菜单 ===');
  await ev("(function(){var a=document.getElementById('br-auto');a.checked=true;a.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()");
  await ev("document.getElementById('br-admin-close').click()");
  await wait(900);
  const px1 = await ev(PIX), h1 = await ev(HASH);
  console.log('面板 hidden:', await ev("document.getElementById('br-admin-root').hidden"),
    '| cfg.auto:', await ev('window.__BR_ADMIN__.cfg.auto'),
    '| 绘制像素:', px1);
  await wait(900);
  const px2 = await ev(PIX), h2 = await ev(HASH);
  console.log('0.9s 后绘制像素:', px2, '| 画面内容已变化:', h1 !== h2,
    '| 绘制循环 FPS:', await ev('window.__BR_ADMIN__.stats.fps'));
  console.log('判定:', (px1 > 0 && px2 > 0 && h1 !== h2) ? 'PASS 关闭面板后仍持续绘制' : 'FAIL');
  await shot('2-menu-closed');

  console.log('\n=== 4 关闭菜单状态下长按屏幕仍可自瞄 ===');
  const before = await ev('window.__BR_TRAJ__.stats.shots');
  await mouse('mousePressed', 300, 330);
  await wait(400);
  const mid = JSON.parse(await ev('JSON.stringify(window.__BR_TRAJ__.stats)'));
  await wait(3200);
  await mouse('mouseReleased', 300, 330);
  await wait(400);
  const after = await ev('window.__BR_TRAJ__.stats.shots');
  const log = JSON.parse(await ev('JSON.stringify(window.__BR_TRAJ__.stats.shotLog)'));
  const bad = log.filter(x => !(x.held === true || (x.heldAgo >= 0 && x.heldAgo <= 150))).length;
  console.log('长按 400ms 时 screenOn:', mid.screenOn, '| src:', mid.src, '| active:', mid.active);
  console.log('关闭菜单后起投次数:', before, '→', after, '| 未持球就投:', bad,
    '| 面板仍 hidden:', await ev("document.getElementById('br-admin-root').hidden"));
  console.log('判定:', (mid.screenOn && after > before && bad === 0) ? 'PASS 功能仍生效' : 'FAIL');

  console.log('\n=== 5 总开关可彻底关闭绘制 ===');
  await ev("(function(){var c=document.getElementById('br-overlay');c.checked=false;c.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()");
  await wait(600);
  console.log('关闭总开关后像素:', await ev(PIX), '(应为 0)');
  await ev("(function(){var c=document.getElementById('br-box');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()");
  await wait(600);
  console.log('重新勾选方框后像素:', await ev(PIX), '| 总开关已自动恢复:', await ev('window.__BR_ADMIN__.cfg.overlay'));

  console.log('\n异常:', errors.length, errors.slice(0, 4));
  console.log('游戏错误:', await ev('JSON.stringify(window.__GAME_ERRORS__||[])'));
  const ext = requests.filter(u => !u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:'));
  console.log('外网请求:', ext.length);
  ws.close();
}
main().then(() => { edge.kill(); process.exit(0); }).catch(e => { console.error('FAILED', e); edge.kill(); process.exit(1); });
