const fs = require('fs');
const j = JSON.parse(fs.readFileSync(__dirname + '/data.json', 'utf8'));
const files = j.project[45];
console.log('total assets:', files.length);
let sum = 0;
files.forEach((f, i) => { sum += f.size; console.log(i, f.name, f.size); });
console.log('total bytes:', sum);
console.log('\nproject[7] audio sample:');
console.log(JSON.stringify(j.project[7]).slice(0, 800));
