const fs = require('fs');
const s = fs.readFileSync(__dirname + '/data.json', 'utf8');
const exts = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.mp3', '.ogg', '.m4a', '.wav', '.aac', '.wasm', '.json', '.js', '.css', '.ttf', '.woff', '.otf', '.gif', '.avif'];
const found = new Set();
for (const e of exts) {
  const q = e.replace('.', '\\.');
  const re = new RegExp('[A-Za-z0-9_\\-./%]*(?:' + q + ')(?:\\?[A-Za-z0-9_&=%.\\-]*)?', 'gi');
  let m;
  while ((m = re.exec(s))) found.add(m[0]);
}
console.log('unique path-like strings:', found.size);
[...found].sort().forEach(x => console.log(x));

const j = JSON.parse(s);
const root = j.project;
console.log('\nproject array length:', root.length);
root.forEach((v, i) => {
  const str = JSON.stringify(v);
  console.log(i, str.length > 220 ? str.slice(0, 220) + '...' : str);
});
