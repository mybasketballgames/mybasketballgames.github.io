/* ===== 离线版运行时扩展（由 build.js 追加到 c3main 代码包末尾） ===== */
(function () {
  'use strict';

  var state = window.__BR_STATE__;

  runOnStartup(async function (runtime) {
    window.__BR_RUNTIME__ = runtime;
    window.__BR_GLOBALVARS__ = runtime.globalVars;

    runtime.addEventListener('tick', function () {
      var g = runtime.globalVars;
      if (g) {
        var g1 = g.p1Score || 0, g2 = g.p2Score || 0;
        // 项目内部的 p1Score / p2Score 与画面左右方向相反，按设置对调
        var swap = !!state.swapScore;
        var s1 = swap ? g2 : g1, s2 = swap ? g1 : g2;

        if (state.infinite) {
          // 无限模式：比分达到 5 分前就回绕，任何「先到 5 分」判定都不会触发。
          // 真实累计分数单独保存，由页面上的中英比分板显示，没有上限。
          var d1 = s1 - state.lastP1, d2 = s2 - state.lastP2;
          if (d1 > 0) state.realP1 += d1;
          if (d2 > 0) state.realP2 += d2;
          if (s1 + s2 < state.lastP1 + state.lastP2) { // 新一局，游戏自己重置了比分
            state.realP1 = 0; state.realP2 = 0;
          }
          if (g1 >= 3 || g2 >= 3) {
            g.p1Score = 0; g.p2Score = 0;
            s1 = 0; s2 = 0;
          }
          state.lastP1 = s1; state.lastP2 = s2;
          state.p1 = state.realP1; state.p2 = state.realP2;
        } else {
          state.p1 = s1; state.p2 = s2;
        }
      }

      // 当前布局名
      try {
        var layout = runtime.getMainRunningLayout && runtime.getMainRunningLayout();
        state.layout = layout
          ? (typeof layout.GetName === 'function' ? layout.GetName() : (layout.name || ''))
          : '';
      } catch (e) { state.layout = ''; }

      // 当前球类型：ballLine 才是画面上真正可见的球，它的动画名就是球类型
      //（ball / heavy / kames / smallball）。heavyBall 等只是常驻的不可见物理碰撞体。
      try {
        var bl = runtime.objects && runtime.objects.ballLine;
        var bi = bl && bl.getFirstInstance && bl.getFirstInstance();
        state.ballKey = bi ? (bi.animationName || 'ball') : '';
      } catch (e) { state.ballKey = ''; }

      // 无限模式：隐藏游戏自带的位图计分板，避免它与「累计比分」显示不一致
      if (state.infinite) {
        try {
          var hideNames = ['scoreBG', 'fontWonder'];
          for (var h = 0; h < hideNames.length; h++) {
            var ho = runtime.objects && runtime.objects[hideNames[h]];
            if (!ho || !ho.getAllInstances) continue;
            var arr = ho.getAllInstances();
            for (var a = 0; a < arr.length; a++) if (arr[a]) arr[a].opacity = 0;
          }
        } catch (e) {}
      }
    });
  });
})();
