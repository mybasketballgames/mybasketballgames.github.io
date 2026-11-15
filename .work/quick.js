/* 快检：自定义球名 / 数据线水印 / 启动闪屏 / WebGPU 错误 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9339;
const FILE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(__dirname, 'edge-q'), '--no-first-run',
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
  let id = 0; const p = new Map(); const errs = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && p.has(m.id)) { const q = p.get(m.id); p.delete(m.id); m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result); return; }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errs.push((m.params.args || []).map(a => a.value || a.description || '').join(' ').slice(0, 160));
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      errs.push(m.params.entry.text.slice(0, 160));
    } else if (m.method === 'Runtime.exceptionThrown') {
      errs.push('EXCEPTION ' + (m.params.exceptionDetails.text || ''));
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; p.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); return r.result && r.result.value; };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Page.navigate', { url: FILE_URL });
  await wait(8500);

  console.log('球动画名:', await ev('window.__BR_STATE__.ballKey'));
  console.log('原始提示:', await ev("document.getElementById('c3-game-text').textContent"));
  console.log('当前球显示:', await ev("document.getElementById('c3-ball-current').textContent"));
  console.log('常驻水印已移除:', await ev("!document.getElementById('c3-watermark')"),
    '| 设置内署名:', await ev("document.querySelector('.c3-set-brand').textContent"),
    '| 启动画面文字:', await ev("document.querySelector('.c3-splash-main').textContent"));
  console.log('启动闪屏已隐藏:', await ev("document.getElementById('c3-splash').hidden"));

  // 自定义名称
  await ev("(function(){var e=document.getElementById('c3-ball-ball');e.value='测试球';e.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()");
  await wait(600);
  console.log('自定义后提示:', await ev("document.getElementById('c3-game-text').textContent"));
  console.log('已保存:', await ev("(function(){var c=JSON.parse(localStorage.getItem('basketRandomOfflineSettings')||'{}');return c.ballNames&&c.ballNames.ball})()"));
  console.log('4 个名称输入框值:', await ev("JSON.stringify(['ball','heavy','kames','smallball'].map(function(k){return document.getElementById('c3-ball-'+k).value}))"));
  console.log('错误数:', errs.length, errs.slice(0, 5));
  console.log('WebGPU 相关错误:', errs.filter(x => /WebGPU/i.test(x)).length);
  ws.close();
}
main().then(() => { edge.kill(); process.exit(0); }).catch(e => { console.error(e); edge.kill(); process.exit(1); });
