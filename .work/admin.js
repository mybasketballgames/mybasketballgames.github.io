/* ===== 管理员菜单（Alt+6）：方框 / 骨架 / 距离线 / 自动投篮开关 =====
   仅作用于本地离线单机版；坐标取自 C3 运行时公开的 scripting 接口。 */
(function () {
  'use strict';

  var KEY = 'basketRandomAdmin';
  var defaults = {
    overlay: true, everOpened: false,       // 首次按 Alt+6 之后绘制层常驻，启动画面保持干净
    box: true, skel: true, dist: true, label: true, aimline: true,
    linewidth: 1.5, auto: false, side: 'both',
    scale: 1, offx: 0, offy: 0
  };
  var DRAW_KEYS = ['box', 'skel', 'dist', 'label', 'aimline'];
  var cfg = Object.assign({}, defaults);
  try {
    var s = JSON.parse(localStorage.getItem(KEY) || '{}');
    Object.keys(defaults).forEach(function (k) { if (s[k] !== undefined) cfg[k] = s[k]; });
  } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} }

  var $ = function (id) { return document.getElementById(id); };
  var root = $('br-admin-root'), panel = $('br-admin-panel'), cv = $('br-admin-canvas');
  var ctx = cv.getContext('2d'), statusEl = $('br-status'), state = window.__BR_STATE__;
  var stats = { guided: 0, target: '-', lastDist: -1, frames: 0, fps: 0, lastFpsT: performance.now() };
  var LW = 290, LH = 190;

  var PLAYERS = [
    { id: 'P1-A', side: 'p1', head: 'head4', body: 'body4', arm: 'arm4', col: 'p4Collision' },
    { id: 'P1-B', side: 'p1', head: 'head3', body: 'body3', arm: 'arm3', col: 'p3Collision' },
    { id: 'P2-A', side: 'p2', head: 'head', body: 'body', arm: 'arm', col: 'p1Collision' },
    { id: 'P2-B', side: 'p2', head: 'head2', body: 'body2', arm: 'arm2', col: 'p2Collision' }
  ];
  var COLOR = { p1: '#4dd2ff', p2: '#ff8a6b', ball: '#ffd166', hoop: '#c792ff', dist: 'rgba(255,255,255,.42)', aim: '#6cff8f' };

  // ---------- 显隐：Alt+6 切换 / Esc 关闭 / × 关闭 ----------
  function setOpen(v) {
    root.hidden = !v;
    if (v) {
      resize();
      // 用户第一次打开菜单 = 明确启用绘制层；之后跨会话保持，取消总开关可彻底关闭
      if (!cfg.everOpened) { cfg.everOpened = true; save(); }
    }
    window.__BR_ADMIN__.open = !!v;
  }
  function toggle() { setOpen(root.hidden); }
  document.addEventListener('keydown', function (e) {
    if (e.altKey && (e.code === 'Digit6' || e.key === '6')) {
      e.preventDefault(); e.stopPropagation(); toggle(); return;
    }
    if (e.key === 'Escape' && !root.hidden) {
      e.stopPropagation(); setOpen(false);
    }
  }, true);
  var closeBtn = $('br-admin-close');
  closeBtn.addEventListener('pointerdown', function (e) { e.stopPropagation(); e.preventDefault(); });
  closeBtn.addEventListener('click', function (e) { e.stopPropagation(); setOpen(false); });
  $('br-close-bottom').addEventListener('click', function (e) { e.stopPropagation(); setOpen(false); });

  // ---------- 拖动（capture 阶段收 pointerup，避免被面板 stopPropagation 吞掉） ----------
  var dragging = false, dx = 0, dy = 0;
  $('br-admin-title').addEventListener('pointerdown', function (e) {
    if (e.target === closeBtn) return;
    dragging = true; dx = e.clientX - panel.offsetLeft; dy = e.clientY - panel.offsetTop;
    e.preventDefault(); e.stopPropagation();
  });
  // 双击标题栏把面板复位，避免被拖到屏幕角落找不回来
  $('br-admin-title').addEventListener('dblclick', function (e) {
    dragging = false;
    panel.style.left = '14px'; panel.style.top = '74px';
    e.stopPropagation();
  });
  function onMove(e) {
    if (!dragging) return;
    panel.style.left = Math.max(0, Math.min(innerWidth - panel.offsetWidth, e.clientX - dx)) + 'px';
    panel.style.top = Math.max(0, Math.min(innerHeight - 60, e.clientY - dy)) + 'px';
  }
  function endDrag() { dragging = false; }
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', endDrag, true);
  window.addEventListener('pointercancel', endDrag, true);
  window.addEventListener('blur', endDrag);
  panel.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  panel.addEventListener('click', function (e) { e.stopPropagation(); });
  panel.addEventListener('wheel', function (e) { e.stopPropagation(); }, { passive: true });
  panel.addEventListener('keydown', function (e) { e.stopPropagation(); });
  panel.addEventListener('keyup', function (e) { e.stopPropagation(); });

  // ---------- 控件 ----------
  function bindChk(id, key) {
    var el = $(id); if (!el) return;
    el.checked = !!cfg[key];
    el.addEventListener('change', function () {
      cfg[key] = el.checked;
      // 勾任意绘制子项时自动打开总开关，避免「勾了却没画面」
      if (el.checked && DRAW_KEYS.indexOf(key) >= 0 && !cfg.overlay) {
        cfg.overlay = true;
        var ov = $('br-overlay'); if (ov) ov.checked = true;
      }
      save();
    });
  }
  function bindRange(id, key, fmt) {
    var el = $(id), out = $(id + '-v'); if (!el || !out) return;
    el.value = cfg[key]; out.textContent = fmt(cfg[key]);
    el.addEventListener('input', function () {
      cfg[key] = Number(el.value); out.textContent = fmt(cfg[key]); save(); resize();
    });
  }
  ['overlay', 'box', 'skel', 'dist', 'label', 'aimline', 'auto'].forEach(function (k) { bindChk('br-' + k, k); });
  bindRange('br-linewidth', 'linewidth', function (v) { return String(v); });
  bindRange('br-scale', 'scale', function (v) { return Number(v).toFixed(2); });
  bindRange('br-offx', 'offx', function (v) { return String(v); });
  bindRange('br-offy', 'offy', function (v) { return String(v); });
  var sideEl = $('br-side'); sideEl.value = cfg.side;
  sideEl.addEventListener('change', function () { cfg.side = sideEl.value; save(); });

  // ---------- 坐标变换 ----------
  function resize() {
    var c = window.c3canvas; if (!c) return;
    var r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.style.left = r.left + 'px'; cv.style.top = r.top + 'px';
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function transform() {
    var c = window.c3canvas; if (!c) return null;
    var r = c.getBoundingClientRect();
    var s = Math.max(r.width / LW, r.height / LH) * cfg.scale;
    return { s: s, ox: r.width / 2 + cfg.offx, oy: r.height / 2 + cfg.offy, w: r.width, h: r.height };
  }
  function pt(inst, t) { return [(inst.x - LW / 2) * t.s + t.ox, (inst.y - LH / 2) * t.s + t.oy]; }
  function objs(name) {
    var r = window.__BR_RUNTIME__;
    if (!r || !r.objects) return [];
    var o = r.objects[name];
    if (!o || !o.getAllInstances) return [];
    try { return o.getAllInstances(); } catch (e) { return []; }
  }
  function first(name) { var a = objs(name); return a.length ? a[0] : null; }

  // ---------- 绘制 ----------
  function drawBox(inst, color, label, t) {
    if (!inst) return;
    var p = pt(inst, t), w = Math.abs(inst.width || 10) * t.s, h = Math.abs(inst.height || 10) * t.s;
    ctx.strokeStyle = color; ctx.lineWidth = cfg.linewidth;
    ctx.strokeRect(p[0] - w / 2, p[1] - h / 2, w, h);
    if (cfg.label && label) {
      ctx.fillStyle = color; ctx.font = '10px Consolas, monospace';
      ctx.fillText(label, p[0] - w / 2, p[1] - h / 2 - 3);
    }
  }
  function line(a, b, color, dashed, width) {
    if (!a || !b) return;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width || cfg.linewidth;
    if (dashed) ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.restore();
  }
  function joint(p, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p[0], p[1], 2.6, 0, Math.PI * 2); ctx.fill();
  }
  function draw(t) {
    ctx.clearRect(0, 0, t.w, t.h);
    var ball = first('ballLine'), hoops = objs('potaCollision'), bp = ball ? pt(ball, t) : null;
    if (cfg.box) hoops.forEach(function (h, i) { drawBox(h, COLOR.hoop, 'HOOP ' + i, t); });
    if (cfg.box && ball) drawBox(ball, COLOR.ball, 'BALL ' + (state ? state.ballKey : ''), t);
    if (cfg.box && first('ballCol')) drawBox(first('ballCol'), 'rgba(255,209,102,.5)', '', t);

    var nearest = null, nearestDist = 1e9;
    PLAYERS.forEach(function (pl) {
      var head = first(pl.head), body = first(pl.body), arm = first(pl.arm), col = first(pl.col);
      if (!col) return;
      var c = COLOR[pl.side];
      if (cfg.box) { drawBox(col, c, pl.id, t); if (head) drawBox(head, c, '', t); }
      if (cfg.skel && head && body) {
        var ph = pt(head, t), pb = pt(body, t), pc = pt(col, t), pa = arm ? pt(arm, t) : null;
        line(ph, pb, c); line(pb, pc, c); if (pa) line(pb, pa, c);
        [ph, pb, pc].forEach(function (p) { joint(p, c); });
        if (pa) joint(pa, c);
      }
      if (ball && (cfg.side === 'both' || cfg.side === pl.side)) {
        var d = Math.hypot(ball.x - col.x, ball.y - col.y);
        if (d < nearestDist) { nearestDist = d; nearest = pl; }
      }
    });
    if (cfg.dist && ball) {
      PLAYERS.forEach(function (pl) {
        var col = first(pl.col); if (!col) return;
        var b = pt(col, t); line(bp, b, COLOR.dist, true, 1);
        var d = Math.hypot(ball.x - col.x, ball.y - col.y);
        ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.font = '10px Consolas, monospace';
        ctx.fillText(d.toFixed(1), (bp[0] + b[0]) / 2, (bp[1] + b[1]) / 2 - 3);
      });
      hoops.forEach(function (h) {
        var b = pt(h, t); line(bp, b, 'rgba(199,146,255,.55)', true, 1);
        var d = Math.hypot(ball.x - h.x, ball.y - h.y);
        ctx.fillStyle = 'rgba(199,146,255,.85)'; ctx.font = '10px Consolas, monospace';
        ctx.fillText('筐 ' + d.toFixed(1), (bp[0] + b[0]) / 2, (bp[1] + b[1]) / 2 - 3);
      });
    }
    stats.target = nearest ? nearest.id : '-';
    stats.lastDist = nearest ? nearestDist : -1;
    if (cfg.aimline && nearest && ball) {
      var tc = first(nearest.col); if (tc) {
        line(bp, pt(tc, t), COLOR.aim, false, cfg.linewidth + 0.8);
        ctx.fillStyle = COLOR.aim; ctx.font = '10px Consolas, monospace';
        ctx.fillText('AIM ' + nearest.id, pt(tc, t)[0] + 6, pt(tc, t)[1] - 6);
      }
    }
  }

  var overlayCleared = false;
  function frame() {
    requestAnimationFrame(frame);
    stats.frames++;
    var now = performance.now();
    if (now - stats.lastFpsT >= 500) {
      stats.fps = Math.round(stats.frames * 1000 / (now - stats.lastFpsT));
      stats.frames = 0; stats.lastFpsT = now;
    }
    // 绘制层与面板显隐解耦：关闭菜单后照常画方框 / 骨架 / 距离线，
    // 自瞄等开关也在 cfg 里持续生效。只有状态文字在面板可见时才更新。
    // everOpened 让首次启动画面保持干净（不常驻任何覆盖元素）。
    if (!cfg.everOpened || !cfg.overlay) {
      if (!overlayCleared) {
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cv.width, cv.height); ctx.restore();
        overlayCleared = true;
      }
      return;
    }
    overlayCleared = false;
    resize();
    var t = transform(); if (!t) return;
    draw(t);
    if (root.hidden) return;
    var ball = first('ballLine');
    var traj = window.__BR_TRAJ__;
    statusEl.textContent =
      'FPS      ' + stats.fps + '\n' +
      '球位置   ' + (ball ? ball.x.toFixed(1) + ', ' + ball.y.toFixed(1) : '-') + '\n' +
      '球类型   ' + ((state && state.ballKey) || '-') + '\n' +
      '最近球员 ' + stats.target + '\n' +
      '距离     ' + (stats.lastDist >= 0 ? stats.lastDist.toFixed(1) : '-') + '\n' +
      '制导     ' + (traj ? traj.stats.guided : 0) + ' 帧' + (cfg.auto ? '（已开启）' : '') + '\n' +
      '菜单关闭后绘制与功能仍生效';
  }
  requestAnimationFrame(frame);

  window.__BR_ADMIN__ = { cfg: cfg, stats: stats, open: false, toggle: toggle, setOpen: setOpen };
})();
