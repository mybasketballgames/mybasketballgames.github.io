const fs = require('fs');
const j = JSON.parse(fs.readFileSync(__dirname + '/data.json', 'utf8'));
const s = fs.readFileSync(__dirname + '/data.json', 'utf8');
const names = new Set();
// images referenced anywhere in data.json
const re = /(?:images|icons|media|fonts)\/[A-Za-z0-9_\-./%]+\.(?:webp|png|jpg|jpeg|svg|webm|mp3|ogg|m4a|wav|ttf|woff2?|otf)/gi;
let m;
while ((m = re.exec(s))) names.add(m[0]);
// explicit asset manifest
for (const f of j.project[45] || []) names.add(f.name);
// extra runtime files
['box2d.wasm', 'sw.js', 'offlineclient.js', 'workermain.js', 'dispatchworker.js', 'jobworker.js'].forEach(x => names.add(x));
[...names].sort().forEach(x => console.log(x));
