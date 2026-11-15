const fs = require('fs');
const p = __dirname + '/build.js';
let s = fs.readFileSync(p, 'utf8');
const start = s.indexOf('// ---------- 5b.');
const end = s.indexOf('function rawScript(');
if (start < 0 || end < 0 || end <= start) throw new Error('markers not found');
const block = [
  '// ---------- 5b. 设置面板（纯覆盖层，不改动游戏内部逻辑） ----------',
  "const settingsCss = read('.work/settings.css');",
  "const settingsHtml = read('.work/settings.html');",
  "const settingsJs = read('.work/settings.js');",
  '',
  ''
].join('\n');
s = s.slice(0, start) + block + s.slice(end);
fs.writeFileSync(p, s, 'utf8');
console.log('rewrote settings block, build.js bytes =', Buffer.byteLength(s));
