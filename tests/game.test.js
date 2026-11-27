import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAST, createGame, startDiscussion, currentSpeaker, speak, legalTargets, resolveNominations, resolveVotes, startNight, resolveNight, nextDay, agentView, checkWinner, computeSuspicionHistory, getSuspicionMatrix, buildChronicle, formatChronicle } from '../src/game.js';
import { buildRequest } from '../src/ai.js';
const seeded = () => { let n=12345; return () => {n=(n*16807)%2147483647;return(n-1)/2147483646;}; };
function fixed() {
 const s=createGame('Human','civilian',seeded(),{ballotMode:'plurality',councilRounds:0,personas:false,randomOrder:false});
 ['civilian','mafia','mafia','doctor','detective','civilian','civilian','civilian'].forEach((r,i)=>s.players[i].role=r);
 return s;
}
const ballots = (s, target) => s.players.filter(p=>p.alive).map(p=>({id:p.id,target:p.id===target?-1:target}));
const actions = (s, target=0, protect=5, inspect=2) => s.players.filter(p=>p.alive && p.role!=='civilian').map(p=>({id:p.id,target:p.role==='mafia'?target:p.role==='doctor'?protect:inspect}));
test('every chosen role preserves the eight-player deck',()=>{
 for(const role of ['random','civilian','mafia','doctor','detective']) {
  const s=createGame('Human',role,seeded());
  assert.equal(s.players.length,8);
  for(const [r,n] of Object.entries({mafia:2,doctor:1,detective:1,civilian:4})) assert.equal(s.players.filter(p=>p.role===r).length,n);
  if(role!=='random') assert.equal(s.players[0].role,role);
 }
 assert.throws(()=>createGame('Human','wizard'));
});
test('random assignment is not tied to a seat',()=>{
 const counts=new Set(Array.from({length:100},()=>createGame().players[0].role));assert.equal(counts.size,4);
});
test('discussion and defense require one turn per living player, then vote',()=>{
 const s=fixed(); startDiscussion(s);assert.throws(()=>speak(s,1,'jump the queue'));
 for(let pass=0;pass<2;pass++) for(let i=0;i<8;i++) speak(s,currentSpeaker(s),'My case.');
 assert.equal(s.phase,'vote');assert.equal(s.log.filter(e=>e.type==='speech').length,16);
});
test('projection never leaks other roles, memories, intel or human notes',()=>{
 const s=fixed();s.players[2].memory='UNIQUE_OTHER_MEMORY';s.players[4].intel=[{text:'UNIQUE_OTHER_INTEL'}];s.notes='UNIQUE_HUMAN_NOTES';
 const v=agentView(s,5,'speech');
 for(const p of v.players) assert.deepEqual(Object.keys(p).sort(),['alive','id','name']);
 const payload=JSON.stringify(buildRequest(s,5,'speech'));
 for(const sentinel of ['UNIQUE_OTHER_MEMORY','UNIQUE_OTHER_INTEL','UNIQUE_HUMAN_NOTES']) assert.ok(!payload.includes(sentinel));
 assert.equal(v.allies.length,0);assert.equal(v.self.role,'civilian');
});
test('Mafia knows allies but cannot see town identities',()=>{
 const v=agentView(fixed(),1,'night');assert.deepEqual(v.allies.map(p=>p.id),[2]);
 assert.ok(!v.players.some(p=>'role' in p));assert.ok(!v.legalTargets.includes(2));assert.ok(!v.legalTargets.includes(1));
});
test('private projection is copied and cannot mutate the game',()=>{
 const s=fixed();s.players[4].intel.push({text:'private'});const v=agentView(s,4,'speech');v.self.intel[0].text='changed';assert.equal(s.players[4].intel[0].text,'private');
});
test('unique plurality eliminates and reveals the selected role',()=>{
 const s=fixed();s.phase='vote';resolveVotes(s,ballots(s,2));assert.equal(s.players[2].alive,false);assert.equal(s.phase,'verdict');
 assert.equal(agentView(s,0,'speech').players[2].revealedRole,'mafia');assert.match(s.log.at(-1).text,/Mafia/);
});
test('ties and an abstention majority eliminate nobody',()=>{
 for(const targets of [[1,0,3,2,5,4,7,6],[-1,-1,-1,-1,-1,-1,-1,0]]) {
  const s=fixed();s.phase='vote';resolveVotes(s,targets.map((target,id)=>({id,target})));assert.ok(s.players.every(p=>p.alive));
 }
});
test('rejects missing, duplicate, dead and self ballots',()=>{
 const s=fixed();s.phase='vote';assert.throws(()=>resolveVotes(s,[]));
 const b=ballots(s,2);b[0].target=0;assert.throws(()=>resolveVotes(s,b));
 b[0]={id:1,target:2};assert.throws(()=>resolveVotes(s,b));assert.equal(s.log.length,1);
});
test('simultaneous night protects a target and grants private investigation',()=>{
 const s=fixed();s.phase='night';resolveNight(s,actions(s,0,0,2));assert.equal(s.players[0].alive,true);assert.equal(s.phase,'dawn');
 assert.equal(s.players[4].intel[0].text,'Cleo is Mafia.');
 assert.ok(!JSON.stringify(agentView(s,5,'speech')).includes('Cleo is Mafia.'));
 assert.ok(!legalTargets(s,3,'night').includes(0));assert.ok(legalTargets(s,3,'night').includes(3));
 nextDay(s);assert.equal(s.day,2);assert.equal(s.phase,'discussion');
});
test('an unprotected victim dies and all night actions still resolve',()=>{
 const s=fixed();s.phase='night';resolveNight(s,actions(s,4,0,1));assert.equal(s.players[4].alive,false);assert.match(s.players[4].intel[0].text,/Theo is Mafia/);
 assert.match(s.log.at(-1).text,/Detective/);
});
test('Mafia disagreement uses the rotating living leader',()=>{
 const s=fixed();s.phase='night';const a=actions(s,0,5,2);a.find(x=>x.id===2).target=6;resolveNight(s,a);assert.equal(s.players[0].alive,false);
 const t=fixed();t.phase='night';t.day=2;const b=actions(t,0,5,2);b.find(x=>x.id===2).target=6;resolveNight(t,b);assert.equal(t.players[6].alive,false);
});
test('rejects invalid night actions atomically',()=>{
 const s=fixed();s.phase='night';const a=actions(s);a[0].target=2;assert.throws(()=>resolveNight(s,a));assert.ok(s.players.every(p=>p.alive));assert.equal(s.players[4].intel.length,0);
});
test('Town wins with zero Mafia; Mafia wins at parity',()=>{
 const s=fixed();s.players[1].alive=s.players[2].alive=false;assert.equal(checkWinner(s),'Town');assert.equal(s.phase,'ended');
 const t=fixed();[0,3,4,5].forEach(id=>t.players[id].alive=false);assert.equal(checkWinner(t),'Mafia');
});
test('dead players cannot speak, vote or act',()=>{
 const s=fixed();s.players[0].alive=false;assert.deepEqual(legalTargets(s,0,'vote'),[]);assert.deepEqual(legalTargets(s,0,'night'),[]);assert.throws(()=>agentView(s,0,'speech'));startDiscussion(s);assert.ok(!s.order.includes(0));
});
test('request fixes the exact model and medium reasoning without shared history',()=>{
 const req=buildRequest(fixed(),5,'speech');assert.equal(req.model,'openai/gpt-6.1-sol');assert.equal(req.reasoning.effort,'medium');assert.equal(req.messages.length,2);assert.equal(req.provider.allow_fallbacks,false);
});
test('only correct transitions can enter night or a new day',()=>{
 const s=fixed();assert.throws(()=>startNight(s));assert.throws(()=>nextDay(s));s.phase='verdict';startNight(s);assert.equal(s.phase,'night');
});
test('fifteen-day stalemate becomes a draw',()=>{
 const s=fixed();s.phase='night';s.day=15;resolveNight(s,actions(s,0,0,2));assert.equal(s.winner,'Draw');assert.equal(s.phase,'ended');
});
test('all seven AI cast members have distinct public personality traits and prompt cues',()=>{
 const aiCast=CAST.slice(1);
 assert.equal(aiCast.length,7);
 const traits=aiCast.map(p=>p.trait);
 assert.ok(traits.every(t=>typeof t==='string' && t.trim().length>0));
 assert.equal(new Set(traits).size,7);
 const s=createGame('Human','civilian',99);
 const p1=s.players[1];
 const v=agentView(s,1,'speech');
 assert.equal(v.self.trait,p1.trait);
 assert.equal(v.self.style,p1.style);
 const req=buildRequest(s,1,'speech');
 assert.ok(req.messages[0].content.includes(p1.trait));
 assert.ok(req.messages[0].content.includes(p1.personality));
 for(const p of v.players) assert.deepEqual(Object.keys(p).sort(),['alive','id','name']);
});
test('suspicion tracking updates deterministically from public events and stays clamped to [-3, 3]',()=>{
 const s=createGame('Human','civilian',42,{personas:false});
 ['civilian','mafia','mafia','doctor','detective','civilian','civilian','civilian'].forEach((r,i)=>s.players[i].role=r);
 startDiscussion(s);
 while(s.phase==='discussion') {
  const sp=currentSpeaker(s);
  if(sp===0) speak(s,0,'I suspect Cleo is hiding something.');
  else if(sp===4) speak(s,4,'I trust Miles so far.');
  else speak(s,sp,'Listening to the room.');
 }
 const afterSpeech=getSuspicionMatrix(s);
 assert.equal(afterSpeech.matrix[0][2],1);
 assert.equal(afterSpeech.matrix[4][3],-1);
 const noms=s.players.map(p=>({id:p.id,target:p.id===2?-1:p.id===0||p.id===1?2:-1,speech:p.id===0||p.id===1?'Nomination reason.':''}));
 resolveNominations(s,noms);
 assert.equal(s.nominee,2);
 const afterNom=getSuspicionMatrix(s);
 assert.equal(afterNom.matrix[0][2],3); // +1 speech +2 nomination = +3
 assert.equal(afterNom.matrix[1][2],2); // +2 nomination
 assert.equal(afterNom.matrix[2][0],1); // mutual reaction from nominee
 speak(s,2,'Defending myself.');
 // Guilty votes from 0,1,3,4,5 (5 of 8 > 4 => executes Cleo who is Mafia); 6 and 7 spare Cleo.
 resolveVotes(s,s.players.map(p=>({id:p.id,target:[0,1,3,4,5].includes(p.id)?2:-1})));
 const snap=getSuspicionMatrix(s);
 assert.equal(snap.day,1);
 assert.ok(!snap.aliveIds.includes(2));
 for(const aid of snap.aliveIds) {
  for(const [tid,val] of Object.entries(snap.matrix[aid])) {
   assert.notEqual(Number(tid),aid);
   assert.ok(val>=-3 && val<=3,`score ${val} out of bounds`);
  }
 }
 // Cleo was revealed Mafia: seat 0 pushed (nom+guilty) so living observer 4 trusts 0 (-1), while seat 6 spared Mafia so observer 4 suspects 6 (+1).
 assert.equal(snap.matrix[4][0],-1);
 assert.equal(snap.matrix[4][6],1);
 assert.equal(snap.matrix[6][2],-1); // seat 6 voted to spare Cleo (-1)
});
test('buildChronicle extracts 2-4 turning points on completed games and excludes private secrets',()=>{
 const g=createGame('Human','civilian',42,{personas:false,councilRounds:0});
 ['civilian','mafia','mafia','doctor','detective','civilian','civilian','civilian'].forEach((r,i)=>g.players[i].role=r);
 g.notes='SUPER_SECRET_HUMAN_NOTE';
 g.players[1].memory='SECRET_AI_MEMORY';
 g.calls.push({request:'sk-or-v1-FAKE_KEY_SENTINEL'});
 assert.deepEqual(buildChronicle(g),[]);
 startDiscussion(g);
 while(g.phase==='discussion') speak(g,currentSpeaker(g),'Day 1 statement.');
 resolveNominations(g,g.players.map(p=>({id:p.id,target:p.id===0?2:-1,speech:p.id===0?'Testing Cleo.':''})));
 speak(g,2,'Defense.');
 resolveVotes(g,g.players.map(p=>({id:p.id,target:[0,3,4,5,6].includes(p.id)?2:-1}))); // Cleo (Mafia) voted out Day 1
 startNight(g);
 resolveNight(g,actions(g,4,0,1)); // Mafia eliminates Detective (June, id 4) on Night 1
 nextDay(g);
 while(g.phase==='discussion') speak(g,currentSpeaker(g),'Day 2 statement.');
 resolveNominations(g,g.players.filter(p=>p.alive).map(p=>({id:p.id,target:p.id===0?1:-1,speech:p.id===0?'Theo next.':''})));
 speak(g,1,'Final defense.');
 resolveVotes(g,g.players.filter(p=>p.alive).map(p=>({id:p.id,target:p.id===1?-1:1}))); // Theo (Mafia) voted out Day 2 -> Town wins
 assert.equal(g.winner,'Town');
 const points=buildChronicle(g);
 assert.ok(points.length>=2 && points.length<=4,`expected 2-4 points, got ${points.length}`);
 assert.ok(points.some(p=>p.kind==='night-strike' && /Detective/.test(p.text)));
 assert.ok(points.some(p=>p.kind==='endgame' && /Town/.test(p.text)));
 const text=formatChronicle(g);
 assert.ok(text.includes('Town wins'));
 for(const secret of ['SUPER_SECRET_HUMAN_NOTE','SECRET_AI_MEMORY','sk-or-v1-FAKE_KEY_SENTINEL']) assert.ok(!text.includes(secret));
});
