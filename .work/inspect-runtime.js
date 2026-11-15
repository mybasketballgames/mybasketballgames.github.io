const fs = require('fs');
const main = fs.readFileSync(__dirname + '/../scripts/main.js', 'utf8');
const runtime = fs.readFileSync(__dirname + '/../scripts/c3runtime.js', 'utf8');

function show(src, label, key, before = 300, after = 500, max = 6) {
  console.log('\n######## ' + label + ' : ' + key + ' ########');
  let i = 0, n = 0, count = 0;
  while ((i = src.indexOf(key, i)) >= 0) { count++; if (n < max) { console.log('--- @' + i + ' ---'); console.log(src.slice(Math.max(0, i - before), i + after).replace(/\n/g, ' ')); } i += key.length; n++; }
  console.log('count=' + count);
}

show(main, 'main', 'new Worker', 260, 320, 8);
show(main, 'main', 'CreateWorker(', 200, 300, 8);
show(main, 'main', 'function r(', 100, 700, 3);
show(main, 'main', 'AddScript', 200, 700, 3);
show(main, 'main', 'c3_callFunction', 200, 300, 4);
show(runtime, 'runtime', 'c3_callFunction', 200, 300, 4);
show(runtime, 'runtime', 'GetProjectFileUrl', 300, 500, 4);
show(runtime, 'runtime', 'FetchArrayBuffer', 200, 300, 4);
show(runtime, 'runtime', 'runOnStartup=', 200, 300, 4);
show(runtime, 'runtime', 'globalThis.runOnStartup', 200, 300, 4);
show(main, 'main', 'C3_InsertHTMLPlaceholders', 200, 300, 2);
