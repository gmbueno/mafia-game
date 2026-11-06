import { readFile, writeFile } from 'node:fs/promises';
import { seededRandom } from '../src/protocol.js';
const [leftPath, rightPath, outputPath] = process.argv.slice(2);
if (!leftPath || !rightPath) throw new Error('Usage: node scripts/compare.mjs report-A.json report-B.json [output.json]');
const [a,b] = await Promise.all([leftPath,rightPath].map(p=>readFile(p,'utf8').then(JSON.parse)));
if(a.mode!==b.mode || a.protocol!==b.protocol || a.split!==b.split || JSON.stringify(a.modelConfig)!==JSON.stringify(b.modelConfig)) throw new Error('Reports must share mode, protocol, split and model settings.');
const left = new Map(a.games.map(g=>[g.seed,g])), right = new Map(b.games.map(g=>[g.seed,g]));
if(left.size!==a.games.length || right.size!==b.games.length) throw new Error('Duplicate seeds are not independent pairs.');
const seeds = [...new Set([...left.keys(),...right.keys()])], differences=[];
for(const seed of seeds){
 const x=left.get(seed),y=right.get(seed);
 if(x?.status==='completed'&&y?.status==='completed')differences.push(Number(y.winner==='Town')-Number(x.winner==='Town'));
}
const random=seededRandom(20261106), draws=[];
if(differences.length)for(let i=0;i<5000;i++){let total=0;for(let j=0;j<differences.length;j++)total+=differences[Math.floor(random()*differences.length)];draws.push(total/differences.length);}
draws.sort((x,y)=>x-y);
const sum=differences.reduce((x,y)=>x+y,0),missing=seeds.length-differences.length;
const report={contrast:`${b.variant} minus ${a.variant}`,metric:'Town win probability',mode:a.mode,protocol:a.protocol,totalSeedPairs:seeds.length,completedPairs:differences.length,incompleteOrMissingPairs:missing,
 difference:differences.length?sum/differences.length:null,pairedBootstrap95CI:draws.length?[draws[125],draws[4874]]:null,
 missingOutcomeSensitivity:seeds.length?[(sum-missing)/seeds.length,(sum+missing)/seeds.length]:null,
 limitations:'Descriptive paired-seed comparison, not a model ranking. Check matching setup and the intended single intervention. Missing outcomes remain reported; confidence intervals are conditional on completed pairs. Random-policy runs measure mechanics only.'};
if(outputPath)await writeFile(outputPath,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
