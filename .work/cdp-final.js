/* 最终验证：语言 / 画质 / 无限模式 / 帧率 / 球类型翻译 / 可玩性 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9337;
const FILE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(__dirname, 'edge-final'), '--no-first-run',
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
  let id = 0; const pend = new Map();
  const logs = [], errors = [], external = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const q = pend.get(m.id); pend.delete(m.id); m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result); return; }
    if (m.method === 'Runtime.consoleAPICalled') {
      const s = (m.params.args || []).map(a => a.value !== undefined ? a.value : (a.description || a.type)).join(' ');
      logs.push('[' + m.params.type + '] ' + s.slice(0, 170));
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push('EXCEPTION ' + (d.text || '') + ' ' + (d.exception && (d.exception.description || d.exception.value) || ''));
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      logs.push('[log.error] ' + m.params.entry.text.slice(0, 170));
    } else if (m.method === 'Network.requestWillBeSent') {
      const u = m.params.request.url;
      if (!/^(file|data|blob|about):/i.test(u) && !u.startsWith('http://127.0.0.1')) external.push(u);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; pend.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result && r.result.value; };
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(__dirname, 'final-' + n + '.png'), Buffer.from(r.data, 'base64')); };
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  const setChk = (n, v) => ev("(function(){var c=document.getElementById('" + n + "');c.checked=" + v + ";c.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()");
  const setSel = (n, v) => ev("(function(){var s=document.getElementById('" + n + "');s.value='" + v + "';s.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()");
  const diagExpr = `JSON.stringify({
    errors: window.__GAME_ERRORS__ || [],
    hasC3: !!window.C3, hasRuntime: !!window.__BR_RUNTIME__,
    dpr: window.devicePixelRatio, canvas: window.c3canvas?[window.c3canvas.width,window.c3canvas.height]:null,
    st: window.__BR_STATE__||{},
    infiniteHits: (window.__GAME_ASSET_HITS__||{})['data.json.infinite']||0,
    wasm: !!(window.__GAME_ASSET_HITS__||{})['box2d.wasm'],
    images: Object.keys(window.__GAME_ASSET_HITS__||{}).filter(k=>k.indexOf('images/')===0).length,
    media: Object.keys(window.__GAME_ASSET_HITS__||{}).filter(k=>k.indexOf('media/')===0).length,
    title: document.querySelector('[data-i18n="title"]').textContent,
    noLabelsRemoved: !document.getElementById('c3-cn-labels'),
    gameText: document.getElementById('c3-game-text').textContent,
    gameTextShown: !document.getElementById('c3-game-text').hidden,
    scoreboard: document.getElementById('c3-scoreboard').textContent,
    fps: document.getElementById('c3-fps').textContent,
    quality: document.getElementById('c3-set-quality').value
  })`;
  const diag = async l => { const d = JSON.parse(await ev(diagExpr)); console.log('\n--- ' + l + ' ---'); console.log(JSON.stringify(d, null, 1)); return d; };

  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Page.navigate', { url: FILE_URL });
  await wait(3500);
  await ev("localStorage.clear();location.reload();'ok'");
  await wait(8500);
  await diag('1 默认状态');
  await shot('1-title');

  console.log('\n===== 2 进入对局 / 球类型翻译 =====');
  await click(934 * 0.36, 547 * 0.65);
  await wait(2600);
  console.log('球类型提示:', await ev("document.getElementById('c3-game-text').textContent"));
  console.log('检测到的球对象:', await ev('window.__BR_STATE__.ballKey'));
  await shot('2-game');

  console.log('\n===== 3 画质切换 0.75x =====');
  await setSel('c3-set-quality', '0.75');
  await wait(8000);
  const q = await diag('3 流畅画质');
  console.log('dpr =', q.dpr, '| canvas =', q.canvas);

  console.log('\n===== 4 无限模式 =====');
  await setChk('c3-set-infinite', true);
  await wait(8500);
  const inf = await diag('4 无限模式');
  console.log('无限版数据命中:', inf.infiniteHits);
  await click(934 * 0.36, 547 * 0.65);
  await wait(2200);
  // 直接把分数设到 5（胜利阈值），验证运行时回绕与累计
  await ev("window.__BR_GLOBALVARS__.p1Score=5;'ok'");
  await wait(700);
  console.log('设 p1Score=5 后 ->', await ev(`JSON.stringify({score:window.__BR_GLOBALVARS__.p1Score,
    real:window.__BR_STATE__.realP1,shown:document.getElementById('c3-scoreboard').textContent,
    errors:window.__GAME_ERRORS__})`));
  await setChk('c3-set-scoreboard', true);
  await wait(500);
  await shot('4-infinite');

  console.log('\n===== 5 帧率显示 / 解锁 =====');
  await setChk('c3-set-fps', true);
  await wait(900);
  console.log('锁定 vsync:', await ev("document.getElementById('c3-fps').textContent"));
  await setChk('c3-set-unlimitedfps', true);
  await wait(2200);
  console.log('解除后:', await ev("document.getElementById('c3-fps').textContent"),
    '| state:', await ev('window.__BR_STATE__.unlimitedFPS'));
  await setChk('c3-set-unlimitedfps', false);

  console.log('\n===== 6 切换英文 =====');
  await setSel('c3-set-lang', 'en');
  await wait(8500);
  const en = await diag('6 英文');
  console.log('英文标题:', en.title, '| 球类型:', en.gameText, '| 比分板:', en.scoreboard);
  await shot('6-en');

  console.log('\n===== 汇总 =====');
  console.log('外部网络请求:', external.length);
  external.slice(0, 5).forEach(u => console.log('  ' + u.slice(0, 110)));
  console.log('异常:', errors.length, '| 控制台消息:', logs.length);
  logs.slice(0, 12).forEach(l => console.log('  ' + l));
  errors.slice(0, 6).forEach(l => console.log('  ' + l));
  ws.close();
}
main().then(() => { edge.kill(); process.exit(0); }).catch(e => { console.error('TEST FAILED:', e); edge.kill(); process.exit(1); });
