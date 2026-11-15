/* ===== 抛物线辅助 + 长按自瞄 =====
   触发规则：
     1) 长按 W / ↑ / 空格，或**长按屏幕 250ms**（左半屏=玩家1，右半屏=玩家2）即激活；
        按住期间不超时，只由松键 / 抬手 / 失焦结束。
     2) 抛物线辅助：激活时显示预测线；还没拿到球时线是淡色 + 一行等待提示。
     3) 自瞄：**必须真正拿到球**才起投 —— 读取球实例变量 hold=1 / handCollision=1 /
        手臂 have=1，并校验持球方与投篮方一致。球在空中、落地、在对面手上时不投、不加分。
        （留 150ms 余量，避免低帧率下持球帧被跳过；视觉上球仍贴在手边。）
     4) 投篮方由输入决定：W/空格=玩家1投右筐，↑=玩家2投左筐；屏幕长按按所在半屏决定。
     5) 起投时若球被抓着先「松手」，否则解锁物理；绘制与制导共用同一条路径。 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var cv = $('br-traj-canvas'), ctx = cv.getContext('2d');
  var ARM_NAMES = ['arm', 'arm2', 'arm3', 'arm4', 'armBiz'];
  var SCREEN_HOLD_MS = 250;              // 长按屏幕多久才算激活（区分点击起跳）
  var HELD_GRACE_MS = 150;               // 刚脱手后的余量，容忍低帧率
  var stats = { guided: 0, shots: 0, hits: 0, held: 0, phase: 'idle', active: false,
    drawn: false, ballHeld: false, holder: '-', keySide: '-', canShoot: false,
    lastHeldAgo: -1, screenOn: false, screenSide: '-', src: '-', nudges: 0,
    lastTarget: '-', pathErr: -1, lastBall: '-', arc: -1, shotLog: [] };
  var held = {};                         // 键盘长按；不超时，只由 keyup / blur 清除
  var screenHold = {};                   // pointerId -> { t0, side }，长按屏幕
  var lastHeldAt = 0;
  var shot = { t0: 0, T: 0, phase: 'idle', path: null, scored: false, shooter: 'p1' };
  var wasHolding = false;

  function st() { return window.__C3_SETTINGS__ || {}; }
  function adm() { return window.__BR_ADMIN__ ? window.__BR_ADMIN__.cfg : {}; }
  function objs(name) {
    var r = window.__BR_RUNTIME__;
    if (!r || !r.objects) return [];
    var o = r.objects[name];
    if (!o || !o.getAllInstances) return [];
    try { return o.getAllInstances(); } catch (e) { return []; }
  }
  function physBall() {
    var names = ['normalBall', 'heavyBall', 'kamesBall', 'smallBall'];
    for (var n = 0; n < names.length; n++) {
      var a = objs(names[n]);
      for (var i = 0; i < a.length; i++) {
        if (a[i] && a[i].behaviors && a[i].behaviors.Physics) return a[i];
      }
    }
    return null;
  }

  // 持球：hold / handCollision / 手臂 have 任一为 1
  function ballInfo() {
    var inst = physBall();
    if (!inst) return null;
    var v = inst.instVars || {}, ph = inst.behaviors && inst.behaviors.Physics;
    var hold = Number(v.hold) || 0, who = Number(v.who);
    var hc = Number(v.handCollision) || 0;
    var armHave = 0;
    for (var i = 0; i < ARM_NAMES.length && !armHave; i++) {
      var a = objs(ARM_NAMES[i]);
      for (var j = 0; j < a.length; j++) {
        try { if (Number(a[j].instVars.have) === 1) { armHave = 1; break; } } catch (e) {}
      }
    }
    var isHeld = hold === 1 || armHave === 1 || hc === 1;
    var now = performance.now();
    if (isHeld) lastHeldAt = now;
    return {
      inst: inst, ph: ph,
      hold: hold, who: who, handCollision: hc,
      isHeld: isHeld,
      lastHeldAgo: lastHeldAt ? now - lastHeldAt : -1,
      x: inst.x, y: inst.y,
      side: inst.x < 145 ? 'left' : 'right'
    };
  }

  // 持球方：who 1/2 = 右方（玩家2），3/4 = 左方（玩家1）；位置兜底
  function holderOf(b) {
    if (b.who === 3 || b.who === 4) return 'p1';
    if (b.who === 1 || b.who === 2) return 'p2';
    return b.side === 'left' ? 'p1' : 'p2';
  }

  function releaseBall(b) {
    for (var i = 0; i < ARM_NAMES.length; i++) {
      var a = objs(ARM_NAMES[i]);
      for (var j = 0; j < a.length; j++) {
        try { a[j].instVars.have = 0; } catch (e) {}
      }
    }
    try {
      b.inst.instVars.hold = 0;
      b.inst.instVars.handCollision = 0;
      b.inst.instVars.who = -1;
    } catch (e) {}
    unlockBall(b);
  }
  function unlockBall(b) {
    if (b.ph) { try { b.ph.isEnabled = true; b.ph.isImmovable = false; } catch (e) {} }
  }

  // ---------- 屏幕长按 ----------
  // 游戏画布上方还有一层 div.c3htmlwrap，所以不能用 target === canvas 判断，
  // 改成「坐标落在 canvas 矩形内，且不点在设置 / 管理员面板上」。
  function canvasHit(e) {
    var c = window.c3canvas || document.getElementById('c3canvas');
    if (!c) return null;
    var tgt = e.target;
    if (tgt && tgt.closest && tgt.closest('#c3-set-panel, #c3-set-btn, #br-admin-panel, #c3-splash')) return null;
    var r = c.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
    return { fx: (e.clientX - r.left) / r.width };
  }
  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var p = canvasHit(e); if (!p) return;
    screenHold[e.pointerId] = { t0: performance.now(), side: p.fx < 0.5 ? 'p1' : 'p2' };
  }
  function onPointerUp(e) {
    delete screenHold[e.pointerId];
    // 抬手就收尾，不等下一帧，避免低帧率下画布残留
    if (!Object.keys(screenHold).length && !Object.keys(held).length) { wasHolding = false; resetShot(); }
  }
  function screenShotSide() {
    if (st().touchAim === false) return null;
    var now = performance.now(), out = null;
    Object.keys(screenHold).forEach(function (id) {
      var h = screenHold[id];
      if (h && now - h.t0 >= SCREEN_HOLD_MS) out = h.side;
    });
    return out;
  }

  // 投篮方：键盘优先，其次屏幕长按
  function shooterOf(b, screenSide) {
    var w = !!(held.w || held.space), up = !!held.up;
    if (w || up) {
      var key = w && up ? 'both' : w ? 'p1' : 'p2';
      return { key: key, side: key === 'both' ? (b && b.x < 145 ? 'p1' : 'p2') : key, src: 'key' };
    }
    if (screenSide) return { key: screenSide, side: screenSide, src: 'screen' };
    return { key: '-', side: 'p1', src: '-' };
  }

  // **拿到球**才允许起投
  function canShoot(b, shooter) {
    if (!b) return { ok: false, why: '无球' };
    if (b.isHeld) {
      return holderOf(b) === shooter
        ? { ok: true, why: '本方持球' }
        : { ok: false, why: '球在对面手上' };
    }
    if (b.lastHeldAgo >= 0 && b.lastHeldAgo < HELD_GRACE_MS) return { ok: true, why: '刚拿到球' };
    if (b.ph && b.ph.isImmovable) return { ok: false, why: '等待开球' };
    return { ok: false, why: '等待拿球' };
  }

  // 本方球员的手部碰撞体：把球放到这里，游戏下一帧会自己判定 hold=1（实测 0.25s 内）
  var HAND_BY_SIDE = { p1: ['handCollision3', 'handCollision4'], p2: ['handCollision', 'handCollision2'] };
  function handFor(shooter, fromX) {
    var names = HAND_BY_SIDE[shooter] || [];
    var best = null, bd = 1e9;
    names.forEach(function (n) {
      objs(n).forEach(function (i) {
        var d = Math.abs(i.x - fromX);
        if (d < bd) { bd = d; best = i; }
      });
    });
    return best;
  }
  var lastNudgeAt = 0, stuckSince = 0;
  function nudgeToHand(b, shooter, now) {
    if (!b || !b.ph || now - lastNudgeAt < 700) return false;
    var h = handFor(shooter, b.x);
    if (!h) return false;
    lastNudgeAt = now;
    try {
      b.ph.isEnabled = true; b.ph.isImmovable = false;
      b.ph.teleport(h.x, h.y); b.ph.setVelocity(0, 0);
      stats.nudges++;
    } catch (e) { return false; }
    return true;
  }

  function pickTarget(sel, shooter) {
    var a = objs('scoreCollision'), right = null, left = null;
    a.forEach(function (i) { if (i.x > 145) right = right || i; else left = left || i; });
    var s = sel === 'both' ? shooter : sel;
    return s === 'p2' ? (left || right) : (right || left);
  }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function makePath(x0, y0, tx, ty, T, arc) {
    var N = 72, pts = [];
    for (var i = 0; i <= N; i++) {
      var u = i / N;
      pts.push({ x: x0 + (tx - x0) * u, y: y0 + (ty - y0) * u - 4 * arc * u * (1 - u) });
    }
    return { pts: pts, N: N, T: T };
  }
  function pathAt(path, u) {
    var f = Math.max(0, Math.min(1, u)) * path.N;
    var i = Math.min(path.N - 1, Math.floor(f)), k = f - i;
    var a = path.pts[i], b = path.pts[i + 1];
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  }

  // ---------- 画布 ----------
  function clearCanvas() {
    if (!cv.width || !cv.height) return;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height); ctx.restore();
  }
  function hardClear() { clearCanvas(); if (cv.width) cv.width = cv.width; }
  function resize() {
    var c = window.c3canvas; if (!c) return null;
    var r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.style.left = r.left + 'px'; cv.style.top = r.top + 'px';
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { s: Math.max(r.width / 290, r.height / 190), ox: r.width / 2, oy: r.height / 2, w: r.width, h: r.height };
  }
  function pt(x, y, t) { return [(x - 145) * t.s + t.ox, (y - 95) * t.s + t.oy]; }

  function drawPath(path, t, u, power, faint) {
    ctx.save();
    ctx.beginPath();
    for (var i = 0; i <= path.N; i++) {
      var p = pt(path.pts[i].x, path.pts[i].y, t);
      if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
    }
    ctx.strokeStyle = faint ? 'rgba(255, 209, 102, .38)' : 'rgba(255, 209, 102, .95)';
    ctx.lineWidth = 2; ctx.setLineDash([7, 5]); ctx.stroke(); ctx.setLineDash([]);
    var cp = pathAt(path, u), c = pt(cp.x, cp.y, t);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(c[0], c[1], 3.5, 0, Math.PI * 2); ctx.fill();
    var end = path.pts[path.N], tp = pt(end.x, end.y, t);
    ctx.strokeStyle = faint ? 'rgba(108,255,143,.45)' : '#6cff8f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(tp[0], tp[1], 9, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tp[0] - 13, tp[1]); ctx.lineTo(tp[0] + 13, tp[1]); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tp[0], tp[1] - 13); ctx.lineTo(tp[0], tp[1] + 13); ctx.stroke();
    ctx.fillStyle = faint ? 'rgba(255,209,102,.6)' : '#ffd166';
    ctx.font = '11px Consolas, monospace';
    var sp = pt(path.pts[0].x, path.pts[0].y, t);
    ctx.fillText('力度 ' + power.toFixed(2) + '  |  飞行 ' + path.T.toFixed(2) + 's', sp[0] + 12, sp[1] - 12);
    ctx.fillStyle = faint ? 'rgba(108,255,143,.6)' : '#6cff8f';
    ctx.fillText('命中点', tp[0] + 13, tp[1] - 10);
    ctx.restore();
  }

  function drawHint(text, t) {
    ctx.save();
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    var w = ctx.measureText(text).width + 22;
    ctx.fillStyle = 'rgba(20, 24, 34, .72)';
    ctx.fillRect(t.ox - w / 2, 12, w, 26);
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1;
    ctx.strokeRect(t.ox - w / 2, 12, w, 26);
    ctx.fillStyle = 'rgba(255,255,255,.86)';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText(text, t.ox, 25);
    ctx.restore();
  }

  // ---------- 键盘 ----------
  function normKey(e) {
    if (e.code === 'KeyW' || e.key === 'w' || e.key === 'W') return 'w';
    if (e.code === 'ArrowUp' || e.key === 'ArrowUp') return 'up';
    if (e.code === 'Space' || e.key === ' ') return 'space';
    return null;
  }
  function resetShot() {
    hardClear();
    shot.phase = 'idle'; shot.path = null; shot.scored = false;
    stats.phase = 'idle'; stats.active = false; stats.drawn = false; stats.canShoot = false;
  }
  function onKeyDown(e) { var k = normKey(e); if (k) held[k] = performance.now(); }
  function onKeyUp(e) {
    var k = normKey(e);
    if (!k) return;
    delete held[k];
    if (!Object.keys(held).length && !Object.keys(screenHold).length) { wasHolding = false; resetShot(); }
  }
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  document.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerUp, true);
  function clearHeld() { held = {}; screenHold = {}; wasHolding = false; resetShot(); }
  window.addEventListener('blur', clearHeld);
  document.addEventListener('visibilitychange', function () { if (document.hidden) clearHeld(); });

  function registerHit(shooter) {
    var g = window.__BR_GLOBALVARS__;
    if (!g) return;
    if (shooter === 'p2') g.p2Score = (g.p2Score || 0) + 1;
    else g.p1Score = (g.p1Score || 0) + 1;
    stats.hits++;
    try {
      objs('fontWonder').forEach(function (f) {
        var w = f.instVars && f.instVars.which;
        f.text = String(w === 1 ? g.p1Score : g.p2Score);
      });
    } catch (e) {}
  }

  function frame() {
    requestAnimationFrame(frame);
    var s = st(), a = adm(), now = performance.now();
    stats.held = Object.keys(held).length;
    var screenSide = screenShotSide();
    stats.screenOn = !!screenSide;
    stats.screenSide = screenSide || '-';
    var holding = stats.held > 0 || !!screenSide;

    if (!holding) {
      clearCanvas();               // 每帧兜底：松开后画布一定干净
      if (wasHolding) resetShot();
      wasHolding = false;
      shot.phase = 'idle'; shot.path = null; shot.scored = false;
      stats.phase = 'idle'; stats.active = false; stats.drawn = false; stats.canShoot = false;
      return;
    }
    wasHolding = true;
    var auto = !!a.auto, show = !!s.traj;
    var t = resize(); if (!t) return;
    clearCanvas(); stats.drawn = false;

    var b = ballInfo();
    if (!b) { stats.phase = '无球'; stats.active = false; return; }
    stats.ballHeld = b.isHeld;
    stats.lastHeldAgo = Math.round(b.lastHeldAgo);
    stats.holder = b.isHeld ? (holderOf(b) === 'p1' ? '左方(P1)' : '右方(P2)') + ' who=' + b.who : '-';
    stats.lastBall = b.x.toFixed(1) + ',' + b.y.toFixed(1);
    var sh = shooterOf(b, screenSide);
    stats.keySide = sh.key === 'both' ? '双方' : sh.key === 'p1' ? '左' : sh.key === 'p2' ? '右' : '-';
    stats.src = sh.src;
    stats.active = auto;

    var power = Math.max(0.5, Math.min(2, Number(s.power) || 1));
    var T = 1.2 / power, arc = 30 / power;
    stats.arc = arc;
    var target = pickTarget(a.side || 'both', sh.side);
    if (target) stats.lastTarget = (target.x > 145 ? '右筐' : '左筐') + ' ' + target.x.toFixed(0) + ',' + target.y.toFixed(0);

    if (shot.phase === 'flying' && shot.path && auto) {
      var path = shot.path;
      var elapsed = (now - shot.t0) / 1000;
      var u = Math.min(1, elapsed / path.T);
      var end = path.pts[path.N];
      var d = dist(b, end);
      stats.phase = '制导中';
      unlockBall(b);
      if (b.isHeld) releaseBall(b);
      if (u >= 1 || d < 9) {
        if (!shot.scored) { shot.scored = true; registerHit(shot.shooter); }
        shot.phase = 'done';
        if (b.ph && b.ph.isEnabled) {
          // 回到本方球员手上：由游戏自己判定 hold=1，形成「拿到球 → 再投」的循环
          var hd = handFor(shot.shooter, b.x);
          try {
            if (hd) { b.ph.teleport(hd.x, hd.y); b.ph.setVelocity(0, 0); }
            else { b.ph.teleport(145, 58); b.ph.setVelocity(0, 180); }
          } catch (e) {}
        }
        drawPath(path, t, 1, power); stats.drawn = true;
        return;
      }
      var cur = pathAt(path, u);
      var err = Math.hypot(cur.x - b.x, cur.y - b.y);
      if (u > 0.06 && (stats.pathErr < 0 || err > stats.pathErr)) stats.pathErr = err;
      if (b.ph && b.ph.isEnabled) {
        try {
          b.ph.teleport(cur.x, cur.y);
          b.ph.setVelocity(0, 0);
          stats.guided++;
        } catch (e) { stats.lastErr = String(e); }
      }
      drawPath(path, t, u, power); stats.drawn = true;
      return;
    }

    var gate = canShoot(b, sh.side);
    stats.canShoot = gate.ok;

    // 球停在地上时递到本方球员手上，让游戏自己判定持球（不投篮、不加分）；
    // 球卡在对面半场超过 2.5 秒也捡回来，避免辅助永久失效。
    if (auto && !gate.ok && (gate.why === '等待开球' || gate.why === '等待拿球')) {
      var vx = 0, vy = 0;
      try { vx = b.ph.getVelocityX(); vy = b.ph.getVelocityY(); } catch (e) {}
      var speed = Math.hypot(vx, vy);
      var ownSide = sh.side === 'p1' ? 'left' : 'right';
      if (gate.why === '等待开球') {
        // 进球后游戏会把球悬在中场等开球；长按期间直接解锁并递到手上
        unlockBall(b);
        nudgeToHand(b, sh.side, now);
      } else if (speed < 120 && (b.side === ownSide || speed < 50)) {
        // 球在本方半场（或已经停住）：递到手上，让游戏自己判定 hold=1
        nudgeToHand(b, sh.side, now);
        stuckSince = 0;
      }
    } else stuckSince = 0;

    // 严格门禁：只有真正拿到球才起投
    if (auto && gate.ok && target) {
      if (b.isHeld) releaseBall(b); else unlockBall(b);
      shot.phase = 'flying'; shot.t0 = now; shot.T = T; shot.scored = false;
      shot.shooter = sh.side;
      shot.path = makePath(b.x, b.y, target.x, target.y, T, arc);
      stats.shotLog.push({ held: b.isHeld, hold: b.hold, why: gate.why,
        heldAgo: Math.round(b.lastHeldAgo), shooter: sh.side, key: sh.key, src: sh.src });
      if (stats.shotLog.length > 60) stats.shotLog.shift();
      stats.shots++; stats.pathErr = -1;
      stats.phase = '起投 · 制导中';
      drawPath(shot.path, t, 0, power); stats.drawn = true;
      return;
    }

    if ((show || auto) && target) {
      drawPath(makePath(b.x, b.y, target.x, target.y, T, arc), t, 0, power, !gate.ok);
      stats.drawn = true;
    }
    stats.phase = auto ? (gate.ok ? '可投 · 待起投' : '待机 · ' + gate.why)
                       : (show ? '仅预测' : '长按中');
    if (!gate.ok) {
      var en = s.lang === 'en', why = gate.why, msg;
      if (why === '等待开球') msg = en ? 'Waiting for serve' : '等待开球…';
      else if (why === '球在对面手上') msg = en ? 'Ball held by the opponent' : '球在对面手上，按对应一侧';
      else msg = en ? 'Waiting: catch the ball first' : '等待拿到球…（拿到球才自动投篮）';
      drawHint(msg, t);
    }
  }
  requestAnimationFrame(frame);

  window.__BR_TRAJ__ = { stats: stats, makePath: makePath, held: held, ballInfo: ballInfo };
})();
