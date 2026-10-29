import {readdirSync} from 'node:fs';import {spawnSync} from 'node:child_process';
const directory=process.argv.includes('--integration')?'tests/integration':'tests';
const files=readdirSync(directory).filter(name=>name.endsWith('.test.ts')).sort();
let failed=0;
for(const file of files){const path=`${directory}/${file}`;console.log(`\n${path}`);const result=spawnSync(process.execPath,['--import','tsx',path],{stdio:'inherit',env:process.env});if(result.status!==0){failed++;if(result.error)console.error(result.error.message);}}
console.log(`\n${files.length} test files, ${failed} failed`);process.exitCode=failed?1:0;
