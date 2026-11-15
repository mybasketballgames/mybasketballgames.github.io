/*
 * 把 Basket Random 的 Construct 3 导出打包成一个可直接双击运行的单文件 HTML。
 *
 * 解决的问题：
 *  1. file:// 协议下 <script type="module"> 与动态 import() 会被 CORS 拦截
 *  2. 原导出缺少 data.json / box2d.wasm / images / media / worker 脚本
 *  3. file:// 下 fetch 相对资源路径会失败
 *  4. 原页面有 file:// 警告弹窗、外部 CrazyGames 广告 SDK、ServiceWorker 注册
 *
 * 做法：所有 JS 内联；所有资源转 base64 由一层虚拟 fetch 提供；
 *      worker 脚本转 blob: URL；运行时入口由内联字符串注入。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WORK = __dirname;
const A = path.join(WORK, 'assets');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const readBuf = p => fs.readFileSync(path.join(ROOT, p));

// ---------- 1. 收集全部资源 ----------
const assets = {};
function add(key, buf, type) {
  assets[key] = { t: type, b: buf.toString('base64') };
}
function addFromWork(key, rel, type) {
  const p = path.join(A, rel);
  if (!fs.existsSync(p)) throw new Error('missing asset: ' + rel);
  add(key, fs.readFileSync(p), type);
}

add('data.json', fs.readFileSync(path.join(WORK, 'data.json')), 'application/json');
addFromWork('box2d.wasm', 'box2d.wasm', 'application/wasm');
addFromWork('icons/loading-logo.png', 'icons/loading-logo.png', 'image/png');

for (const dir of ['images', 'media']) {
  for (const name of fs.readdirSync(path.join(A, dir)).sort()) {
    const type = name.endsWith('.webp') ? 'image/webp'
      : name.endsWith('.webm') ? 'audio/webm'
        : name.endsWith('.png') ? 'image/png' : 'application/octet-stream';
    addFromWork(dir + '/' + name, dir + '/' + name, type);
  }
}

// 与 data.json 的引用核对
const dataJson = JSON.parse(read('.work/data.json'));
const referenced = new Set();
const re = /(?:images|icons|media|fonts)\/[A-Za-z0-9_\-./%]+\.(?:webp|png|jpg|jpeg|svg|webm|mp3|ogg|m4a|wav|ttf|woff2?|otf)/gi;
let m;
while ((m = re.exec(fs.readFileSync(path.join(WORK, 'data.json'), 'utf8')))) referenced.add(m[0]);
for (const f of dataJson.project[45] || []) referenced.add(f.name);
const missing = [...referenced].filter(k => !assets[k]);
if (missing.length) throw new Error('assets missing for: ' + missing.join(', '));

// 无限模式用的项目数据：把项目内 gameOver 函数体清空，
// 进球、计分、场地随机器件照常工作，但不再弹出胜利结算，比分可以一直增长。
const infiniteData = JSON.parse(fs.readFileSync(path.join(WORK, 'data.json'), 'utf8'));
let patchedCount = 0;
(function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    if (node[0] === 4 && Array.isArray(node[1]) && node[1][0] === 'gameOver') {
      const last = node.length - 1;
      if (Array.isArray(node[last])) { node[last] = []; patchedCount++; }
    }
    node.forEach(walk);
  } else {
    Object.keys(node).forEach(k => walk(node[k]));
  }
})(infiniteData);
if (patchedCount < 1) throw new Error('cannot locate gameOver function in data.json');
add('data.json.infinite', Buffer.from(JSON.stringify(infiniteData), 'utf8'), 'application/json');
console.log('infinite-mode data.json: patched gameOver functions =', patchedCount);

console.log('assets:', Object.keys(assets).length, 'files,',
  (Object.values(assets).reduce((n, a) => n + a.b.length, 0) / 1048576).toFixed(2), 'MiB base64');

// ---------- 2. 运行时代码包（等价于 c3main.js 的 5 个 import，按顺序） ----------
const runtimeFiles = [
  'box2d.wasm.js',
  'scripts/c3runtime.js',
  'scripts/objRefTable.js',
  'project/FrameRateLimit.js',
  'project/javaScriptInEvents.js',
  '.work/offline-ext.js'
];
// 每个文件原本是独立的 ES module，用 IIFE 包裹以保持各自独立的顶层作用域
const bundle = runtimeFiles.map(f => {
  let code = read(f);
  if (f.endsWith('FrameRateLimit.js')) {
    // 解除帧率限制后，物理参数仍要按显示器真实刷新率计算
    code = 'var requestAnimationFrame = window.__BR_NATIVE_RAF__;\n' + code;
  }
  if (f.endsWith('c3runtime.js')) {
    // 彻底关闭 WebGPU 探测：老显卡（Intel Gen7/Gen9 等）上它会先抛一条错误再回退 WebGL，
    // 而这个 2D 游戏用 WebGL 2 完全一致。直接把开关置否，控制台干净。
    const probe = 'const i=navigator["gpu"]&&this._isWebGPUEnabled;';
    if (!code.includes(probe)) throw new Error('cannot find WebGPU probe in c3runtime.js');
    code = code.replace(probe, 'const i=!1;');
  }
  return '\n/* ==== ' + f + ' ==== */\n(function(){\n' + code + '\n})();\n';
}).join('\n');
if (/<\/script/i.test(bundle)) throw new Error('bundle contains </script');

// ---------- 3. 改写 main.js ----------
let main = read('scripts/main.js');

const oldV = 'async#V(e){if("playable-ad-single-file"===this.#I){if(this._localFileStrings.hasOwnProperty(e))return{isStringSrc:!0,str:this._localFileStrings[e]};if(this._localFileBlobs.hasOwnProperty(e))return URL.createObjectURL(this._localFileBlobs[e]);throw new Error("missing script: "+e)}return e}';
const newV = 'async#V(e){if("scripts/c3main.js"===e&&window.__C3_RUNTIME_BUNDLE__)return{isStringSrc:!0,str:window.__C3_RUNTIME_BUNDLE__};return e}';
if (!main.includes(oldV)) throw new Error('cannot find #V in main.js');
main = main.replace(oldV, newV);

const oldW = 'async CreateWorker(e,t){if(e.startsWith("blob:"))return new Worker(e,t);';
const newW = 'async CreateWorker(e,t){if(e.startsWith("blob:"))return new Worker(e,t);{const __u=window.__C3_WORKER_URLS__&&window.__C3_WORKER_URLS__[e];if(__u)return new Worker(__u,t)}';
if (!main.includes(oldW)) throw new Error('cannot find CreateWorker in main.js');
main = main.replace(oldW, newW);

// 项目里配置了 C3 网页广告插件，初始化时会去加载 Google adsbygoogle.js。
// 离线版完全不需要广告，直接把这个「动态加载外部脚本」的动作变成空操作，
// 避免任何外网请求、广告遮挡和加载卡顿。
const oldAd = 'async _AddScript(e,t=null){const i=this._GetApi();return i["webAdsScriptLoaded"]=!1,new Promise((n,r)=>{const s=document.createElement("script");if(t)for(let e in t)s.setAttribute(e,t[e]);s.onload=function(){i["webAdsScriptLoaded"]=!0,n()},s.onerror=function(e){i["webAdsScriptLoaded"]=!1,n()},s.src=e,document.head.appendChild(s)})}';
const newAd = 'async _AddScript(e,t=null){/* offline build: do not load external ad scripts */return}';
if (!main.includes(oldAd)) throw new Error('cannot find _AddScript in main.js');
main = main.replace(oldAd, newAd);

// 广告插件 Configure 在脚本未加载时会往控制台打一条红色错误，离线版直接让它成功
const oldCfg = 'd("Configure",async(d,r,t,s,i,n,o,l,c)=>{a["webAdsScriptLoaded"]?e.Success(c,"UNKNOWN&&not-determined&&true"):e.Failure(c,"advert script not loaded, likely blocked by an ad blocker")})';
const newCfg = 'd("Configure",async(d,r,t,s,i,n,o,l,c)=>{e.Success(c,"UNKNOWN&&not-determined&&true")})';
if (!main.includes(oldCfg)) throw new Error('cannot find advert Configure in main.js');
main = main.replace(oldCfg, newCfg);

if (/<\/script/i.test(main)) throw new Error('main.js contains </script');

// ---------- 4. 兼容层 ----------
const workerSources = {
  'scripts/dispatchworker.js': fs.readFileSync(path.join(A, 'scripts_dispatchworker.js'), 'utf8'),
  'scripts/jobworker.js': fs.readFileSync(path.join(A, 'scripts_jobworker.js'), 'utf8')
};

const shim = String.raw`
/* ===== 离线单文件兼容层 ===== */
(function () {
  'use strict';

  // 4.0 离线扩展的共享状态（必须在任何游戏脚本执行前就绪）
  var savedCfg = {};
  try { savedCfg = JSON.parse(localStorage.getItem('basketRandomOfflineSettings') || '{}'); } catch (e) {}
  window.__BR_STATE__ = {
    p1: 0, p2: 0, realP1: 0, realP2: 0, lastP1: 0, lastP2: 0,
    layout: '', ballKey: '',
    infinite: !!savedCfg.infinite,
    unlimitedFPS: !!savedCfg.unlimitedFPS,
    swapScore: savedCfg.swapScore !== false,
    lang: savedCfg.lang === 'en' ? 'en' : 'zh'
  };

  // 画质：Construct 用 self.devicePixelRatio 计算 canvas 内部分辨率，
  // 覆盖它即可在「流畅 / 标准 / 高清 / 超清」之间切换真实渲染像素数。
  var q = Number(savedCfg.qualityScale);
  window.__BR_QUALITY_SCALE__ = (q >= 0.5 && q <= 3) ? q : 1;
  try {
    Object.defineProperty(window, 'devicePixelRatio', {
      get: function () { return window.__BR_QUALITY_SCALE__; }, configurable: true
    });
  } catch (e) {}

  // WebGPU 探测在老显卡上会打红色错误再回退，改在 c3runtime.js 里直接关闭（见下方 bundle 处理）。

  // 4.0b 帧率解锁：默认走原生 rAF；开启后改用定时器驱动，绕过显示器 vsync。
  // FrameRateLimit.js 会改用 __BR_NATIVE_RAF__ 测真实刷新率，避免物理参数被放大。
  var nativeRAF = window.requestAnimationFrame.bind(window);
  var nativeCancelRAF = window.cancelAnimationFrame.bind(window);
  window.__BR_NATIVE_RAF__ = nativeRAF;
  window.requestAnimationFrame = function (cb) {
    if (!window.__BR_STATE__.unlimitedFPS) return nativeRAF(cb);
    return setTimeout(function () { cb(performance.now()); }, 0);
  };
  window.cancelAnimationFrame = function (id) {
    if (window.__BR_STATE__.unlimitedFPS) return clearTimeout(id);
    return nativeCancelRAF(id);
  };

  // 4.1 资源虚拟文件系统：拦截所有对游戏资源路径的 fetch
  var ASSETS = JSON.parse(document.getElementById('game-assets').textContent);
  var KEYS = Object.keys(ASSETS);
  var cache = new WeakMap();

  function decode(rec) {
    var bytes = cache.get(rec);
    if (!bytes) {
      var bin = atob(rec.b), len = bin.length;
      bytes = new Uint8Array(len);
      for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
      cache.set(rec, bytes);
    }
    return bytes;
  }

  function lookup(input) {
    var u;
    if (input && typeof input === 'object' && typeof input.url === 'string') u = input.url;
    else u = String(input);
    if (/^(data|blob|https?):/i.test(u)) return null;
    u = u.replace(/\\/g, '/').split('#')[0].split('?')[0];
    try { u = decodeURIComponent(u); } catch (e) {}
    u = u.replace(/^\.\//, '');
    if (ASSETS[u]) return u;
    for (var i = 0; i < KEYS.length; i++) {
      if (u === KEYS[i] || u.slice(-(KEYS[i].length + 1)) === '/' + KEYS[i]) return KEYS[i];
    }
    return null;
  }

  var nativeFetch = window.fetch.bind(window);
  var hits = window.__GAME_ASSET_HITS__ = Object.create(null);
  window.fetch = function (input, init) {
    var key = lookup(input);
    if (!key) return nativeFetch(input, init);
    hits[key] = (hits[key] || 0) + 1;
    var rec = ASSETS[key];
    // 无限模式：改用「移除结算函数」的项目数据
    if (key === 'data.json' && window.__BR_STATE__.infinite && ASSETS['data.json.infinite']) {
      rec = ASSETS['data.json.infinite'];
      hits['data.json.infinite'] = (hits['data.json.infinite'] || 0) + 1;
    }
    var bytes = decode(rec);
    try {
      return Promise.resolve(new Response(bytes, {
        status: 200, statusText: 'OK',
        headers: { 'Content-Type': rec.t, 'Content-Length': String(bytes.length) }
      }));
    } catch (err) {
      return Promise.reject(err);
    }
  };

  // compileStreaming 对自建 Response 的兼容性兜底（不影响功能）
  if (window.WebAssembly && WebAssembly.compileStreaming) {
    WebAssembly.compileStreaming = function (source) {
      return Promise.resolve(source)
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (b) { return WebAssembly.compile(b); });
    };
  }

  // 4.2 Worker：file:// 下不能加载 file:// 脚本，改用 blob: URL
  var WORKER_SRC = JSON.parse(document.getElementById('worker-sources').textContent);
  window.__C3_WORKER_URLS__ = {};
  Object.keys(WORKER_SRC).forEach(function (name) {
    var url = URL.createObjectURL(new Blob([WORKER_SRC[name]], { type: 'text/javascript' }));
    window.__C3_WORKER_URLS__[name] = url;
    // 也兼容带 ./ 前缀或不带 scripts/ 前缀的调用
    window.__C3_WORKER_URLS__['./' + name] = url;
    window.__C3_WORKER_URLS__[name.replace(/^scripts\//, '')] = url;
  });

  // 4.3 运行时入口：把原本要动态 import 的 c3main.js 换成内联代码
  window.__C3_RUNTIME_BUNDLE__ = document.getElementById('c3-bundle').textContent;

  // 4.4 CrazyGames 广告 SDK 的离线替身：跳过广告并立即回调，避免游戏卡在等待广告
  function c3call(name) {
    try {
      var p = window.c3_callFunction && window.c3_callFunction(name);
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) { /* 项目未定义该回调时忽略 */ }
  }
  window.CallAdsFromC3 = function () {
    c3call('adStarted');
    setTimeout(function () { c3call('adFinished'); }, 16);
  };
  window.GameStartEvent = function () {};
  window.GameStopEvent = function () {};
  window.CrazyGames = { SDK: { ad: { requestAd: function () {} }, game: { gameplayStart: function () {}, gameplayStop: function () {} } } };

  // 4.5 诊断：把所有异常/错误汇总到 window.__GAME_ERRORS__，便于离线排查
  window.__GAME_ERRORS__ = [];
  window.addEventListener('error', function (e) {
    window.__GAME_ERRORS__.push('error: ' + (e.message || '') + ' @ ' + (e.filename || '') + ':' + (e.lineno || ''));
  });
  window.addEventListener('unhandledrejection', function (e) {
    window.__GAME_ERRORS__.push('rejection: ' + String(e.reason && e.reason.stack || e.reason));
  });
})();
`;

// ---------- 5. 组装 HTML ----------
const css = read('style.css');
const modernCheck = read('scripts/modernjscheck.js');
const supportCheck = read('scripts/supportcheck.js');

// ---------- 5b. 设置面板（纯覆盖层，不改动游戏内部逻辑） ----------
const settingsCss = read('.work/settings.css');
const settingsHtml = read('.work/settings.html');
const settingsJs = read('.work/settings.js');

// ---------- 5c. 管理员菜单（Alt+6，调试可视化与自动辅助） ----------
const adminCss = read('.work/admin.css');
const adminHtml = read('.work/admin.html');
const adminJs = read('.work/admin.js');
const trajJs = read('.work/trajectory.js');

function rawScript(id, type, content) {
  if (/<\/script/i.test(content)) throw new Error('unsafe </script in ' + id);
  if (content.includes('<!--')) throw new Error('unsafe <!-- in ' + id);
  return '<script id="' + id + '" type="' + type + '">' + content + '</script>';
}

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="UTF-8">
<title>Basket Random - 本地版</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no">
<meta name="generator" content="Scirra Construct (offline single-file build)">
<style>
${css}
${settingsCss}
${adminCss}
</style>
</head>
<body>
<noscript>
  <div id="notSupportedWrap">
    <h2 id="notSupportedTitle">This content requires JavaScript</h2>
    <p class="notSupportedMessage">JavaScript appears to be disabled. Please enable it to view this content.</p>
  </div>
</noscript>

<!-- 全部游戏资源（base64），由下面的兼容层通过虚拟 fetch 提供 -->
${rawScript('game-assets', 'application/json', JSON.stringify(assets))}
<!-- 后台 worker 源码 -->
${rawScript('worker-sources', 'application/json', JSON.stringify(workerSources))}
<!-- 运行时代码包：原本由 scripts/c3main.js 动态 import -->
${rawScript('c3-bundle', 'text/plain', bundle)}

<script id="br-shim">${shim}</script>
<script>${modernCheck}</script>
<script>${supportCheck}</script>
<script type="module">
${main}
</script>

${settingsHtml}
<script id="br-settings">${settingsJs}</script>

${adminHtml}
<script id="br-admin">${adminJs}</script>
<script id="br-traj">${trajJs}</script>
</body></html>
`;

// 备份原始壳文件（只备份一次）
const backup = path.join(ROOT, 'index.source.html');
if (!fs.existsSync(backup)) fs.writeFileSync(backup, read('index.html'), 'utf8');

const out = path.join(ROOT, 'index.html');
fs.writeFileSync(out, html, 'utf8');
console.log('written:', out, (Buffer.byteLength(html) / 1048576).toFixed(2), 'MiB');
