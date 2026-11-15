/* ===== 离线版设置面板：语言 / 画质 / 无限模式 / 帧率 / 音量 / 中英界面 ===== */
(function () {
  'use strict';

  var KEY = 'basketRandomOfflineSettings';
  var I18N = {
    zh: {
      title: '游戏设置', language: '界面语言', quality: '画质', volume: '音量', mute: '静音',
      showFps: '左上角显示帧率', unlimitedFps: '解除帧率限制（无限制）',
      infinite: '无限模式（无分数上限）', scoreboard: '显示比分板',
      hints: '显示操作提示', smooth: '画面平滑（关闭为像素风）', gameText: '显示球类型提示',
      traj: '抛物线辅助（长按投篮键显示）', power: '投篮力度 / 弧线',
      touchAim: '长按屏幕也能自瞄（左半屏玩家1 / 右半屏玩家2）',
      swapScore: '比分左右对调（修正原生计分方向）',
      ballCfg: '球类型名称（可自定义）', ballCur: '当前球：',
      ballCfgNote: '左边是游戏内部动画名；改完即时生效并自动保存',
      fullscreen: '⛶ 全屏 / 退出全屏', restart: '↻ 重新开始游戏',
      noteInfinite: '切换语言 / 画质 / 无限模式会自动重新开始一局',
      tips: '<b>操作说明</b><br>1P 模式：<b>W</b> / <b>空格</b> / 点击画面起跳<br>' +
            '2P 模式：左玩家 <b>W</b>，右玩家 <b>↑</b> 上方向键<br>' +
            '<b>F2</b> 打开设置，<b>Esc</b> 关闭设置<br>' +
            '标准模式先得 5 分获胜；无限模式比分累计无上限。<br>' +
            '抛物线 / 自瞄：<b>长按投篮键</b>激活，球进入本方投篮范围才自动投出。<br>' +
            '球类型：<b>弹力球</b>（紫）/ <b>双倍球</b>（彩色）/ <b>铅球</b>（灰）/ 普通球。<br>' +
            '设置会自动保存在本机。',
      hintBar: '1P：W / 空格 / 点击　·　2P：W 与 ↑（上方向键）　·　F2 设置',
      scoreboardP1: '玩家1', scoreboardP2: '玩家2',
      fpsUnit: ' 帧/秒', infinityOn: '无限·累计', normalMode: '标准',
      q0: '流畅 0.75x', q1: '标准 1x', q2: '高清 1.25x', q3: '超清 1.5x',
      ballLabel: '本局：', ballWait: '准备中',
      ballNames: { ball: '普通球', heavy: '铅球', kames: '双倍球', smallball: '弹力球' }
    },
    en: {
      title: 'Settings', language: 'Language', quality: 'Quality', volume: 'Volume', mute: 'Mute',
      showFps: 'Show FPS (top-left)', unlimitedFps: 'Unlock frame rate (unlimited)',
      infinite: 'Infinite mode (no score limit)', scoreboard: 'Show scoreboard',
      hints: 'Show control hints', smooth: 'Smooth scaling (off = pixelated)', gameText: 'Show ball type',
      traj: 'Trajectory assist (hold shoot key)', power: 'Shot power / arc',
      touchAim: 'Long-press screen to auto-shoot (left half P1 / right half P2)',
      swapScore: 'Swap score sides (fix native direction)',
      ballCfg: 'Ball names (editable)', ballCur: 'Current: ',
      ballCfgNote: 'Left column is the internal animation name; changes apply instantly',
      fullscreen: '⛶ Toggle fullscreen', restart: '↻ Restart game',
      noteInfinite: 'Changing language / quality / infinite mode restarts the game',
      tips: '<b>Controls</b><br>1P: <b>W</b> / <b>Space</b> / click to jump<br>' +
            '2P: left <b>W</b>, right <b>↑</b> (Up Arrow)<br>' +
            '<b>F2</b> settings, <b>Esc</b> close<br>' +
            'Normal: first to 5 points wins. Infinite: unlimited score.<br>' +
            'Trajectory / auto shot: <b>hold the shoot key</b>; fires when the ball enters your range.<br>' +
            'Balls: <b>Bouncy</b> (purple) / <b>Double</b> (rainbow) / <b>Lead</b> (grey) / Normal.<br>' +
            'Settings are saved locally.',
      hintBar: '1P: W / Space / click　·　2P: W and ↑　·　F2 settings',
      scoreboardP1: 'P1', scoreboardP2: 'P2',
      fpsUnit: ' FPS', infinityOn: 'INF·total', normalMode: 'STD',
      q0: 'Fast 0.75x', q1: 'Normal 1x', q2: 'HD 1.25x', q3: 'Ultra 1.5x',
      ballLabel: 'Ball: ', ballWait: 'Ready',
      ballNames: { ball: 'Normal ball', heavy: 'Lead ball', kames: 'Double ball', smallball: 'Bouncy ball' }
    }
  };

  var ANIM_KEYS = ['ball', 'heavy', 'kames', 'smallball'];
  var DEFAULT_BALL_NAMES = { ball: '普通球', heavy: '铅球', kames: '双倍球', smallball: '弹力球' };
  var defaults = {
    volume: 100, muted: false, fps: false, hints: false,
    lang: 'zh', infinite: false, unlimitedFPS: false,
    scoreboard: false, qualityScale: 1, smooth: true, gameText: true, swapScore: true,
    traj: false, power: 1, touchAim: true,
    ballNames: DEFAULT_BALL_NAMES
  };
  var cfg = Object.assign({}, defaults);
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    Object.keys(defaults).forEach(function (k) { if (saved[k] !== undefined) cfg[k] = saved[k]; });
  } catch (e) {}
  if (cfg.lang !== 'en') cfg.lang = 'zh';
  if (!(cfg.qualityScale >= 0.5 && cfg.qualityScale <= 3)) cfg.qualityScale = 1;
  // 兼容旧版按对象名保存的自定义名，只保留四个动画名键
  var bn = {};
  ANIM_KEYS.forEach(function (k) {
    var v = cfg.ballNames && cfg.ballNames[k];
    bn[k] = (typeof v === 'string' && v) ? v : DEFAULT_BALL_NAMES[k];
  });
  cfg.ballNames = bn;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} }

  var $ = function (id) { return document.getElementById(id); };
  var btn = $('c3-set-btn'), panel = $('c3-set-panel'), fpsBox = $('c3-fps'),
      hintBar = $('c3-hintbar'), scoreBox = $('c3-scoreboard'), gameTextBox = $('c3-game-text'),
      vol = $('c3-set-vol'), volVal = $('c3-set-vol-val'), mute = $('c3-set-mute'),
      fpsChk = $('c3-set-fps'), hintsChk = $('c3-set-hints'),
      fpsFree = $('c3-set-unlimitedfps'), infiniteChk = $('c3-set-infinite'),
      scoreChk = $('c3-set-scoreboard'), smoothChk = $('c3-set-smooth'),
      gameTextChk = $('c3-set-gametext'), swapChk = $('c3-set-swap'),
      trajChk = $('c3-set-traj'), touchChk = $('c3-set-touch'),
      powerSlider = $('c3-set-power'), powerVal = $('c3-set-power-val'),
      langSel = $('c3-set-lang'), qualitySel = $('c3-set-quality');

  var state = window.__BR_STATE__;

  // 面板上的操作不要穿透到游戏（bubble 阶段拦截，控件本身仍可正常响应）
  [btn, panel].forEach(function (el) {
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click',
     'touchstart', 'touchend', 'keydown', 'keyup', 'wheel'].forEach(function (t) {
      el.addEventListener(t, function (e) { e.stopPropagation(); });
    });
  });

  function toggle(show) {
    var open = show === undefined ? panel.hidden : !!show;
    panel.hidden = !open;
    if (open) applyAll();
  }
  btn.addEventListener('click', function () { toggle(); });
  $('c3-set-close').addEventListener('click', function () { toggle(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'F2') { e.preventDefault(); e.stopPropagation(); toggle(); }
    else if (e.key === 'Escape' && !panel.hidden) { e.stopPropagation(); toggle(false); }
  }, true);

  // 语言 / 画质下拉文案
  function applyLang() {
    var d = I18N[cfg.lang];
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (d[k] !== undefined && typeof d[k] === 'string') el.textContent = d[k];
    });
    $('c3-set-tips').innerHTML = d.tips;
    hintBar.textContent = d.hintBar;
    btn.title = cfg.lang === 'zh' ? '设置（F2）' : 'Settings (F2)';
    document.documentElement.lang = cfg.lang === 'zh' ? 'zh-CN' : 'en';
    if (state) state.lang = cfg.lang;
    langSel.value = cfg.lang;
    var qs = [d.q0, d.q1, d.q2, d.q3];
    for (var i = 0; i < qualitySel.options.length && i < qs.length; i++) qualitySel.options[i].textContent = qs[i];
    qualitySel.value = String(cfg.qualityScale);
    updateScoreboard();
    updateGameText();
  }
  langSel.addEventListener('change', function () {
    cfg.lang = langSel.value === 'en' ? 'en' : 'zh';
    save(); location.reload();
  });

  // 画质：改变渲染分辨率需要重建 canvas，重载后由兼容层覆盖 devicePixelRatio
  qualitySel.addEventListener('change', function () {
    cfg.qualityScale = Number(qualitySel.value);
    save(); location.reload();
  });
  function applySmooth() {
    var c = window.c3canvas;
    if (c) c.style.imageRendering = cfg.smooth ? 'auto' : 'pixelated';
  }
  smoothChk.addEventListener('change', function () {
    cfg.smooth = smoothChk.checked; save(); applySmooth();
  });
  gameTextChk.addEventListener('change', function () {
    cfg.gameText = gameTextChk.checked; save(); updateGameText();
  });
  trajChk.addEventListener('change', function () { cfg.traj = trajChk.checked; save(); });
  touchChk.addEventListener('change', function () { cfg.touchAim = touchChk.checked; save(); });
  powerSlider.addEventListener('input', function () {
    cfg.power = Number(powerSlider.value);
    powerVal.textContent = cfg.power.toFixed(2);
    save();
  });
  swapChk.addEventListener('change', function () {
    cfg.swapScore = swapChk.checked;
    if (state) {
      state.swapScore = cfg.swapScore;
      state.lastP1 = 0; state.lastP2 = 0;
      state.realP1 = 0; state.realP2 = 0;
      state.p1 = 0; state.p2 = 0;
    }
    save(); updateScoreboard();
  });

  // 音量：Construct 音频插件把主增益暴露在 C3Audio_DOMInterface 上
  var syncTimer = null;
  function applyVolume() {
    var a = window.C3Audio_DOMInterface;
    if (!a) return;
    var v = cfg.muted ? 0 : Math.max(0, Math.min(1, Number(cfg.volume) / 100));
    try {
      if (a._destinationNode && a._destinationNode.gain) a._destinationNode.gain.value = v;
      a._masterVolume = v;
    } catch (e) {}
  }
  function volumeChanged() {
    applyVolume();
    if (!syncTimer) syncTimer = setInterval(applyVolume, 400);
  }
  vol.addEventListener('input', function () {
    cfg.volume = Number(vol.value);
    volVal.textContent = cfg.volume + '%';
    if (cfg.volume > 0 && cfg.muted) { cfg.muted = false; mute.checked = false; }
    save(); volumeChanged();
  });
  mute.addEventListener('change', function () { cfg.muted = mute.checked; save(); volumeChanged(); });

  // 帧率显示 / 帧率解锁
  fpsChk.addEventListener('change', function () { cfg.fps = fpsChk.checked; fpsBox.hidden = !cfg.fps; save(); });
  fpsFree.addEventListener('change', function () {
    cfg.unlimitedFPS = fpsFree.checked;
    if (state) state.unlimitedFPS = cfg.unlimitedFPS;
    save();
  });

  // 无限模式：换用另一份项目数据 + 运行时分数回绕，重载后生效
  infiniteChk.addEventListener('change', function () {
    cfg.infinite = infiniteChk.checked;
    if (cfg.infinite) cfg.scoreboard = true;
    save(); location.reload();
  });

  scoreChk.addEventListener('change', function () { cfg.scoreboard = scoreChk.checked; save(); updateScoreboard(); });
  hintsChk.addEventListener('change', function () { cfg.hints = hintsChk.checked; save(); hintBar.hidden = !cfg.hints; });

  $('c3-set-fullscreen').addEventListener('click', function () {
    var d = document, el = d.documentElement;
    try {
      if (!d.fullscreenElement && !d.webkitFullscreenElement) {
        (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
      } else {
        (d.exitFullscreen || d.webkitExitFullscreen || function () {}).call(d);
      }
    } catch (e) {}
  });
  $('c3-set-restart').addEventListener('click', function () { location.reload(); });

  // 彩蛋：2 秒内连点设置面板底部「数据线」3 次，打开管理员菜单
  var brandHits = 0, brandTime = 0;
  var brand = $('c3-set-brand');
  if (brand) brand.addEventListener('click', function (e) {
    e.stopPropagation();
    var now = Date.now();
    if (now - brandTime > 2000) brandHits = 0;
    brandTime = now; brandHits++;
    if (brandHits >= 3) {
      brandHits = 0;
      if (window.__BR_ADMIN__) window.__BR_ADMIN__.setOpen(true);
      else document.dispatchEvent(new KeyboardEvent('keydown', { key: '6', code: 'Digit6', altKey: true, bubbles: true }));
    }
  });

  // 比分板（无限模式显示累计真实比分）/ 球类型翻译提示
  function updateScoreboard() {
    var d = I18N[cfg.lang], st = state || { p1: 0, p2: 0 };
    var tag = cfg.infinite ? d.infinityOn : d.normalMode;
    scoreBox.innerHTML = '<span class="c3-sb-tag">' + tag + '</span>' +
      d.scoreboardP1 + ' <b>' + (st.p1 | 0) + '</b> : <b>' + (st.p2 | 0) + '</b> ' + d.scoreboardP2;
    scoreBox.hidden = !cfg.scoreboard;
  }
  function updateGameText() {
    var d = I18N[cfg.lang], st = state || {};
    var key = st.ballKey || '';
    var names = cfg.lang === 'zh' ? cfg.ballNames : d.ballNames;
    var name = key ? (names[key] || key) : d.ballWait;
    gameTextBox.innerHTML = '<b>' + d.ballLabel + '</b>' + name;
    gameTextBox.hidden = !cfg.gameText;
    var cur = $('c3-ball-current');
    if (cur) cur.textContent = key || '-';
    ANIM_KEYS.forEach(function (k) {
      var el = $('c3-ball-' + k);
      if (el && document.activeElement !== el) el.value = cfg.ballNames[k] || '';
    });
  }
  ANIM_KEYS.forEach(function (k) {
    var el = $('c3-ball-' + k);
    if (el) el.addEventListener('input', function () {
      cfg.ballNames[k] = el.value || DEFAULT_BALL_NAMES[k];
      save(); updateGameText();
    });
  });

  function applyAll() {
    vol.value = cfg.volume;
    volVal.textContent = cfg.volume + '%';
    mute.checked = !!cfg.muted;
    fpsChk.checked = !!cfg.fps;
    hintsChk.checked = !!cfg.hints;
    fpsFree.checked = !!cfg.unlimitedFPS;
    infiniteChk.checked = !!cfg.infinite;
    scoreChk.checked = !!cfg.scoreboard;
    smoothChk.checked = !!cfg.smooth;
    gameTextChk.checked = !!cfg.gameText;
    trajChk.checked = !!cfg.traj;
    touchChk.checked = cfg.touchAim !== false;
    powerSlider.value = cfg.power;
    powerVal.textContent = Number(cfg.power).toFixed(2);
    swapChk.checked = !!cfg.swapScore;
    fpsBox.hidden = !cfg.fps;
    hintBar.hidden = !cfg.hints;
    if (state) {
      state.unlimitedFPS = !!cfg.unlimitedFPS;
      state.swapScore = !!cfg.swapScore;
      state.lang = cfg.lang;
    }
    applyLang();
    applySmooth();
  }
  applyAll();
  if (cfg.volume !== 100 || cfg.muted) volumeChanged();
  setInterval(function () { updateScoreboard(); updateGameText(); applySmooth(); }, 250);

  // 「数据线」启动水印：淡出后隐藏，全程不拦截任何点击
  var splash = $('c3-splash');
  if (splash) {
    var sub = $('c3-splash-sub');
    if (sub) sub.textContent = cfg.lang === 'zh' ? 'Basket Random · 本地版' : 'Basket Random · Offline';
    setTimeout(function () { splash.classList.add('c3-fade'); }, 1900);
    setTimeout(function () { splash.hidden = true; }, 2700);
  }

  // FPS 计数器（跟随实际渲染循环，解除帧率限制后会显示更高数值）
  var frames = 0, last = performance.now();
  function fpsLoop(t) {
    frames++;
    if (t - last >= 500) {
      if (cfg.fps) fpsBox.textContent = Math.round(frames * 1000 / (t - last)) + I18N[cfg.lang].fpsUnit;
      frames = 0; last = t;
    }
    requestAnimationFrame(fpsLoop);
  }
  requestAnimationFrame(fpsLoop);
  window.__C3_SETTINGS__ = cfg;
})();
