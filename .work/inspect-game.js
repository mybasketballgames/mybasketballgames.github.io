const fs = require('fs');
const raw = fs.readFileSync(__dirname + '/data.json', 'utf8');
const p = JSON.parse(raw).project;

console.log('=== 全局变量 (project[3]) ===');
for (const v of p[3]) {
  console.log('  name=' + JSON.stringify(v[0]) + '  type=' + v[1] + '  init=' + JSON.stringify(v[2]) + '  rest=' + JSON.stringify(v.slice(3)).slice(0, 160));
}

console.log('\n=== 事件表里的全局变量引用 (project[6] 概览) ===');
console.log('layout/event sheets:', Array.isArray(p[6]) ? p[6].length : typeof p[6]);
if (Array.isArray(p[6])) p[6].forEach((s, i) => console.log('  [' + i + '] ' + JSON.stringify(s).slice(0, 180)));

console.log('\n=== 布局 (project[5]) 概览 ===');
console.log(JSON.stringify(p[5]).slice(0, 400));

console.log('\n=== 对象类型名 (project[2]) ===');
const objs = [];
try {
  const walk = (a) => { if (Array.isArray(a)) a.forEach(x => { if (typeof x === 'string') objs.push(x); else walk(x); }); };
  walk(p[2]);
} catch (e) {}
console.log([...new Set(objs)].filter(s => /^[A-Za-z][A-Za-z ]{2,28}$/.test(s)).slice(0, 80).join(' | '));

console.log('\n=== 所有字符串常量（过滤技术词） ===');
const tech = new Set(('images media icons fonts audio webm png webp Sprite Keyboard Mouse Touch Browser Physics Behavior ' +
  'Animation Layout Event Function Plugin Object SpriteFont Text Tilemap Array Dictionary JSON AJAX ' +
  'default nearest linear high low auto fullscreen vsync regular bold italic none left right center ' +
  'true false null ScnRefreshRate divideSmooth_Hz angularOffset_Hz jumpPower_Hz jumpAddForce_Hz ' +
  'landPhysics intro game gameEvent player1Event player2Event titleChars titleBG ' +
  'Animation 1 P1 P2 win start jump buttonx bup bellsoc goasoc refsoc file wrong menu press metal music win intro-button intro-sound ' +
  'com.twoplayergames.basketrandom').split(/\s+/));
const strs = new Set();
for (const m of raw.matchAll(/"([^"\\\n]{1,60})"/g)) {
  const s = m[1];
  if (!/^[A-Za-z]/.test(s)) continue;
  if (tech.has(s)) continue;
  if (/^(images|media|icons|fonts)\//.test(s)) continue;
  if (/\.(webp|png|webm|wasm|js|json|ttf|woff)/.test(s)) continue;
  if (/^[a-z]+[A-Z]/.test(s)) continue; // camelCase 标识符
  strs.add(s);
}
console.log([...strs].sort().join('\n'));

console.log('\n=== 分数/胜负相关关键字 ===');
for (const kw of ['score', 'Score', 'win', 'Win', 'limit', 'Limit', 'max', 'Max', 'point', 'Point', 'goal', 'Goal', 'round', 'Round', 'end', 'End', 'finish', 'Finish']) {
  let c = 0, i = 0, samples = [];
  while ((i = raw.indexOf(kw, i)) >= 0) {
    c++;
    if (samples.length < 2) samples.push(raw.slice(Math.max(0, i - 90), i + 110));
    i += kw.length;
  }
  if (c) console.log(kw + ': ' + c + '  ' + samples.join(' ~~ '));
}
