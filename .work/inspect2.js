const fs = require('fs');
const P = __dirname + '/../';
const main = fs.readFileSync(P + 'scripts/main.js', 'utf8');
const rt = fs.readFileSync(P + 'scripts/c3runtime.js', 'utf8');
const all = { main, rt };

function show(which, key, before = 250, after = 450, max = 5) {
  const src = all[which];
  console.log('\n#### ' + which + ' : ' + key + ' ####');
  let i = 0, n = 0, c = 0;
  while ((i = src.indexOf(key, i)) >= 0) { c++; if (n < max) { console.log('--- @' + i + ' ---\n' + src.slice(Math.max(0, i - before), i + after).replace(/\n/g, ' ')); } i += key.length; n++; }
  console.log('count=' + c);
}

show('rt', 'runOnStartup', 200, 250, 4);
show('main', 'runOnStartup', 200, 250, 4);
show('rt', 'OfflineClientInfo', 200, 250, 3);
show('main', 'OfflineClientInfo', 200, 250, 3);
show('rt', 'GetMediaFileUrl', 150, 300, 3);
show('rt', '_mediaSubfolder', 200, 200, 4);
show('rt', 'new Audio', 200, 250, 4);
show('rt', 'createImageBitmap', 200, 300, 4);
show('rt', 'FetchImage', 200, 250, 4);
show('rt', '_LoadImage', 200, 400, 4);
show('rt', 'JobScheduler', 150, 250, 5);
show('main', 'dispatchworker.js', 200, 250, 3);
show('main', 'jobworker.js', 200, 250, 3);
show('rt', 'function AddScript', 200, 400, 2);
show('rt', 'AddScript=', 200, 400, 2);
show('main', 'GetScriptFolder', 150, 250, 3);
