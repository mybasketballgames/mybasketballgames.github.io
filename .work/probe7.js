/* 找出真正可动的物理球对象 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9344;
const FILE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(__dirname, 'edge-p7'), '--no-first-run',
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
  let id = 0; const p = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { const q = p.get(m.id); p.delete(m.id); m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result); } };
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; p.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); return r.result && r.result.value; };
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: FILE_URL });
  await wait(8000);
  await click(934 * 0.36, 547 * 0.65);
  await wait(2500);

  console.log('=== 所有带 Physics 行为的对象实例 ===');
  console.log(await ev(`(function(){
    var r=window.__BR_RUNTIME__, out=[];
    Object.keys(r.objects||{}).forEach(function(name){
      var o=r.objects[name], a;
      try{ a=o.getAllInstances?o.getAllInstances():[]; }catch(e){return}
      a.forEach(function(i,idx){
        var ph=i&&i.behaviors&&i.behaviors.Physics;
        if(!ph)return;
        var d={name:name,idx:idx,x:Math.round(i.x*10)/10,y:Math.round(i.y*10)/10};
        ['isEnabled','mass','isImmovable','isBullet','linearDamping','elasticity'].forEach(function(k){try{d[k]=ph[k];}catch(e){}});
        try{d.vel=ph.getVelocityX().toFixed(1)+','+ph.getVelocityY().toFixed(1);}catch(e){d.vel='err'}
        out.push(d);
      });
    });
    return JSON.stringify(out);
  })()`));

  console.log('\n=== setVelocity 实测（normalBall vs ballLine）===');
  console.log(await ev(`(function(){
    var r=window.__BR_RUNTIME__,res={};
    ['normalBall','ballLine','ballCol','heavyBall'].forEach(function(n){
      var o=r.objects[n];var a=o&&o.getAllInstances?o.getAllInstances():[];
      if(!a.length){res[n]='no instance';return}
      var i=a[0],ph=i.behaviors&&i.behaviors.Physics;
      if(!ph){res[n]='no physics';return}
      try{
        var before=ph.getVelocityX().toFixed(2)+','+ph.getVelocityY().toFixed(2);
        var imm0=ph.isImmovable;
        try{ph.isImmovable=false;}catch(e){}
        var imm1=ph.isImmovable;
        ph.setVelocity(120,-200);
        var after=ph.getVelocityX().toFixed(2)+','+ph.getVelocityY().toFixed(2);
        res[n]={immBefore:imm0,immAfter:imm1,before:before,after:after,x:i.x.toFixed(1),y:i.y.toFixed(1)};
      }catch(e){res[n]='ERR '+e}
    });
    return JSON.stringify(res);
  })()`));
  // 等 0.6 秒看球位置是否变化
  await wait(600);
  console.log('\n=== 0.6s 后位置 ===');
  console.log(await ev(`(function(){
    var r=window.__BR_RUNTIME__,res={};
    ['normalBall','ballLine','ballCol'].forEach(function(n){
      var o=r.objects[n];var a=o&&o.getAllInstances?o.getAllInstances():[];
      res[n]=a.length?a[0].x.toFixed(1)+','+a[0].y.toFixed(1):'none';
    });
    return JSON.stringify(res);
  })()`));
  ws.close();
}
main().then(() => { edge.kill(); process.exit(0); }).catch(e => { console.error(e); edge.kill(); process.exit(1); });
