const fs = require('fs');
const raw = fs.readFileSync(__dirname + '/data.json', 'utf8');
const p = JSON.parse(raw).project;

console.log('=== 各 event sheet 的变量 ===');
for (const sheet of p[6]) {
  const name = sheet[0];
  const vars = sheet[1] || [];
  const list = vars.map(v => Array.isArray(v) && typeof v[1] === 'string' ? v[1] + '=' + JSON.stringify(v[2]) : null).filter(Boolean);
  console.log('\n[' + name + '] (' + list.length + ')');
  console.log('  ' + list.join(' | '));
}

console.log('\n=== 包含 score / win / point / goal / limit / max 的变量或字符串 ===');
const hits = new Set();
for (const m of raw.matchAll(/"([A-Za-z][A-Za-z0-9_]{1,30})"/g)) {
  const s = m[1];
  if (/score|win|point|goal|limit|max|round|finish|end|set|match|cpu|diff|mode/i.test(s)) hits.add(s);
}
console.log([...hits].sort().join('\n'));

console.log('\n=== 数字 3/5/7/10 在 gameEvent sheet 中的上下文 ===');
const ge = JSON.stringify(p[6].find(s => s[0] === 'gameEvent'));
for (const n of [3, 5, 7, 10]) {
  const re = new RegExp('\\[[^\\]]{0,80}(?:,\\s*)?' + n + '(?:,\\s*)[^\\]]{0,80}\\]', 'g');
  const ms = [...ge.matchAll(re)].slice(0, 4);
  console.log(n + ': ' + ms.map(m => m[0].slice(0, 160)).join('\n   '));
}

console.log('\n=== 字符串常量（后半段） ===');
const tech = new Set(('images media icons fonts audio webm png webp Sprite Keyboard Mouse Touch Browser Physics Behavior ' +
  'Animation Layout Event Function Plugin Object SpriteFont Text Tilemap Array Dictionary JSON AJAX ' +
  'default nearest linear high low auto fullscreen vsync regular bold italic none left right center ' +
  'true false null TPG Array DrawingCanvas Mouse Touch Browser PlatformInfo advert MobileAdvert CrazyGames ' +
  'Basket Random Pin Timer Anchor Tween Sin Fade Bullet wrap Anchor Arm BG Ball Bonus Control CPU Default').split(/ /));
const strs = new Set();
for (const m of raw.matchAll(/"([^"\\\n]{1,60})"/g)) {
  const s = m[1];
  if (!/^[A-Za-z]/.test(s) || tech.has(s)) continue;
  if (/^(images|media|icons|fonts)\//.test(s) || /\.(webp|png|webm|wasm|js|json|ttf|woff)/.test(s)) continue;
  if (/^[a-z]+[A-Z]/.test(s)) continue;
  if (s.length > 32) continue;
  strs.add(s);
}
console.log([...strs].sort().join(' | '));
