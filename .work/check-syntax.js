const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function grab(re, label) {
  const m = html.match(re);
  if (!m) throw new Error('cannot find ' + label);
  return m[1];
}
const checks = [
  ['shim', grab(/<script id="br-shim">([\s\S]*?)<\/script>/, 'shim')],
  ['main module', grab(/<script type="module">\n([\s\S]*?)\n<\/script>/, 'main')],
  ['runtime bundle', grab(/<script id="c3-bundle" type="text\/plain">([\s\S]*?)<\/script>/, 'bundle')],
  ['settings js', grab(/<script id="br-settings">([\s\S]*?)<\/script>/, 'settings')],
  ['admin js', grab(/<script id="br-admin">([\s\S]*?)<\/script>/, 'admin')],
  ['trajectory js', grab(/<script id="br-traj">([\s\S]*?)<\/script>/, 'trajectory')]
];
for (const [name, code] of checks) {
  try {
    new vm.Script(code, { filename: name });
    console.log('OK   syntax', name, code.length, 'chars');
  } catch (e) {
    console.log('FAIL syntax', name, e.message);
    process.exitCode = 1;
  }
}
// JSON 块
for (const id of ['game-assets', 'worker-sources']) {
  const s = grab(new RegExp('<script id="' + id + '" type="application\\/json">([\\s\\S]*?)<\\/script>'), id);
  try { const j = JSON.parse(s); console.log('OK   json', id, Object.keys(j).length, 'entries'); }
  catch (e) { console.log('FAIL json', id, e.message); process.exitCode = 1; }
}
console.log('html bytes', Buffer.byteLength(html));
