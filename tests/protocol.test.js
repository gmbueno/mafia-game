import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startDiscussion, currentSpeaker, speak, whisper, resolveNominations, resolveVotes, startNight, resolveNight, alive, agentView, legalTargets, remember, replayAt, exportGame } from '../src/game.js';
import { buildRequest, requestTurn, recordCall, ledgerSummary, checkBudget } from '../src/ai.js';
import { runAutomatedGame, beliefProbe, scoreBeliefs } from '../src/evaluation.js';
import { MODEL, wordCount } from '../src/protocol.js';
const fixed = () => {
  const state = createGame('Human','civilian',42,{personas:false});
  ['civilian','mafia','mafia','doctor','detective','civilian','civilian','civilian'].forEach((role,id) => state.players[id].role=role);
  return state;
};
const openNominations = s => { startDiscussion(s); while(s.phase === 'discussion') speak(s,currentSpeaker(s),'My statement.'); };
const nominate = (s,target) => alive(s).map(p => ({id:p.id,target:p.id===target?-1:target,speech:'Explain this claim.'}));
const pricing = { prompt: 0.000001, completion: 0.000002, request: 0 };
function response(turn, extras={}) { return { ok:true,status:200,json:async()=>({model:MODEL,id:'response-1',choices:[{message:{content:typeof turn === 'string'?turn:JSON.stringify(turn)},finish_reason:'stop'}],usage:{total_tokens:60,cost:0.01},...extras}) }; }
test('nominee alone can defend and only they can be executed',()=>{
 const s=fixed();openNominations(s);resolveNominations(s,nominate(s,3));
 assert.equal(s.phase,'defense');assert.equal(currentSpeaker(s),3);
 assert.throws(()=>speak(s,7,'A last-minute accusation'));
 speak(s,3,'My answer.');assert.equal(s.phase,'vote');
 assert.throws(()=>speak(s,7,'Another accusation'));
 assert.deepEqual(legalTargets(s,0,'vote'),[-1,3]);assert.deepEqual(legalTargets(s,3,'vote'),[-1]);
 const tie=alive(s).map((p,i)=>({id:p.id,target:[0,1,2,4].includes(i)?3:-1}));
 resolveVotes(s,tie);assert.ok(s.players[3].alive);
});
test('strict majority executes; no nominations skips the ballot',()=>{
 const s=fixed();openNominations(s);resolveNominations(s,nominate(s,2));speak(s,2,'Defense.');
 resolveVotes(s,alive(s).map(p=>({id:p.id,target:p.id===2?-1:2})));assert.equal(s.players[2].alive,false);
 const t=fixed();openNominations(t);resolveNominations(t,alive(t).map(p=>({id:p.id,target:-1,speech:''})));assert.equal(t.phase,'verdict');assert.equal(t.nominee,null);
});
test('nomination reasons and actor sets are validated atomically',()=>{
 const s=fixed();openNominations(s);const before=structuredClone(s),n=nominate(s,2);n[0].speech='';
 assert.throws(()=>resolveNominations(s,n));assert.deepEqual(s,before);
 n[0]={id:1,target:2,speech:'reason'};assert.throws(()=>resolveNominations(s,n));assert.deepEqual(s,before);
});
test('seed reproduces roles, personalities, order and nomination tie draw',()=>{
 const a=createGame('Human','random',123),b=createGame('Human','random',123);
 assert.deepEqual(a.players,b.players);openNominations(a);openNominations(b);assert.deepEqual(a.order,b.order);
 const n=alive(a).map(p=>({id:p.id,target:(p.id+1)%8,speech:'Reason.'}));resolveNominations(a,n);resolveNominations(b,n);assert.equal(a.nominee,b.nominee);
});
test('Mafia can reply privately; council never enters Town view or public log',()=>{
 const s=fixed();s.phase='verdict';startNight(s);const first=currentSpeaker(s);whisper(s,first,'COUNCIL_SECRET');
 const second=currentSpeaker(s);assert.notEqual(first,second);assert.match(JSON.stringify(agentView(s,second,'council')),/COUNCIL_SECRET/);
 assert.ok(!JSON.stringify(agentView(s,0,'speech')).includes('COUNCIL_SECRET'));assert.ok(!JSON.stringify(s.log).includes('COUNCIL_SECRET'));
 while(s.phase==='council')whisper(s,currentSpeaker(s),'Reply.');assert.equal(s.council.length,4);assert.equal(s.phase,'night');
 assert.throws(()=>whisper(s,first,'Too late'));
});
test('dead Mafia do not receive later private messages',()=>{
 const s=fixed();s.players[1].alive=false;s.phase='verdict';startNight(s);assert.equal(s.phase,'night');assert.throws(()=>whisper(s,1,'Secret'));
});
test('human and model speeches and notebooks use word limits',async()=>{
 const s=fixed();startDiscussion(s);speak(s,currentSpeaker(s),Array(200).fill('word').join(' '));assert.equal(wordCount(s.log.find(e=>e.type==='speech').text),55);
 const fetch=globalThis.fetch;
 try {
  globalThis.fetch=async()=>response({speech:Array(180).fill('word').join(' '),target:-1,memory:Array(200).fill('note').join(' ')});
  const turn=await requestTurn(s,1,'speech',{pricing});assert.equal(wordCount(turn.speech),55);assert.equal(wordCount(turn.memory),120);
  assert.equal(s.calls.at(-1).outcome,'accepted_clipped');
 } finally {globalThis.fetch=fetch;}
});
test('invalid replies keep cost, duration, configuration and visible text in ledger',async()=>{
 const s=fixed(),fetch=globalThis.fetch;
 try {globalThis.fetch=async()=>response('{invalid');await assert.rejects(requestTurn(s,1,'speech',{pricing}));}
 finally{globalThis.fetch=fetch;}
 assert.equal(s.usage.calls,1);assert.equal(s.usage.cost,.01);assert.equal(s.calls.at(-1).outcome,'invalid');
 assert.equal(s.calls[0].request.reasoning.effort,'medium');assert.ok(s.calls[0].promptHash);assert.equal(s.calls.at(-1).responseId,'response-1');
});
test('truncation does not silently reduce reasoning; refusal and malformed targets cannot enter game',async()=>{
 const s=fixed(),fetch=globalThis.fetch;
 try {
  globalThis.fetch=async()=>response({speech:'Valid text',target:-1,memory:''},{choices:[{message:{content:'{}',reasoning:'PRIVATE_PROVIDER_REASONING'},finish_reason:'length'}]});
  await assert.rejects(requestTurn(s,1,'speech',{pricing}),/token limit/);assert.equal(s.calls.at(-1).outcome,'truncated');
  assert.ok(!JSON.stringify(s.calls).includes('PRIVATE_PROVIDER_REASONING'));
  globalThis.fetch=async()=>response({speech:'',target:99,memory:''});await assert.rejects(requestTurn(s,1,'night',{pricing}),/invalid/);
 }finally{globalThis.fetch=fetch;}
});
test('concurrent reservations stop spending before the next dispatch',async()=>{
 const s=fixed(),fetch=globalThis.fetch;let requests=0,release;
 try {
  globalThis.fetch=()=>{requests++;return new Promise(resolve=>{release=()=>resolve(response({speech:'Hello.',target:-1,memory:''}));});};
  const first=requestTurn(s,1,'speech',{pricing,budget:{maxUsd:1,maxCalls:1}});
  await assert.rejects(requestTurn(s,2,'speech',{pricing,budget:{maxUsd:1,maxCalls:1}}),/Spending guard/);
  assert.equal(requests,1);release();await first;
 }finally{globalThis.fetch=fetch;}
});
test('failed or pending requests with unknown cost retain conservative reservations',()=>{
 const calls=[{attemptId:'a',stage:'started',reservation:.3},{attemptId:'a',stage:'finished',usage:{}},{attemptId:'b',stage:'started',reservation:.2}];
 assert.equal(ledgerSummary(calls).reserved,.5);assert.equal(ledgerSummary(calls).unknown,1);assert.throws(()=>checkBudget(calls,{maxUsd:.6,maxCalls:5},.2));
});
test('observations are invariant to others secrets across discussion, nominations, defense, votes, council and night',()=>{
 for(let seed=1;seed<=50;seed++) {
  const s=createGame('Human','civilian',seed);
  for(const phase of ['discussion','nomination','defense','vote','council','night']) {
   s.phase=phase;
   for(const actor of s.players.filter(p=>p.role!=='mafia')) {
    const other=structuredClone(s),hidden=other.players.filter(p=>p.id!==actor.id);
    [hidden[0].role,hidden[1].role]=[hidden[1].role,hidden[0].role];
    for(const p of hidden){p.memory='SECRET';p.intel=[{text:'SECRET'}];}
    other.calls=[{content:'SECRET'}];other.history=[{args:['SECRET']}];other.notes='SECRET';
    other.council=[{id:hidden[0].id,text:'SECRET',audience:hidden.slice(0,2).map(p=>p.id)}];
    assert.deepEqual(agentView(s,actor.id,phase),agentView(other,actor.id,phase));
   }
  }
 }
});
test('full seeded game replays exactly, including memories and private messages',async()=>{
 for(let seed=1;seed<=15;seed++) {
  const {state,status}=await runAutomatedGame({seed});assert.equal(status,'completed');
  const replay=replayAt(state);
  for(const field of ['players','log','history','council','winner','rng','day','phase'])assert.deepEqual(replay[field],state[field],field);
  const exported=exportGame(state);assert.equal(replayAt(exported).winner,state.winner);assert.ok(!('notes'in exported));
 }
});
test('audit and notebooks are excluded from live prompts; export requires game over',()=>{
 const s=fixed();remember(s,2,'PRIVATE_NOTE');s.calls.push({request:'SECRET_API_TEST'});assert.throws(()=>exportGame(s));
 const request=JSON.stringify(buildRequest(s,0,'speech'));assert.ok(!request.includes('PRIVATE_NOTE'));assert.ok(!request.includes('SECRET_API_TEST'));
 assert.match(buildRequest(s,1,'speech').messages[0].content,/invent an investigation result as part of a bluff/);
});
test('belief probes are detached and never change the player memory or transcript',()=>{
 const s=fixed(),before=structuredClone(s),probe=beliefProbe(s,0);probe.view.self.memory='mutated';assert.deepEqual(s,before);
 const truth=Object.fromEntries(s.players.slice(1).map(p=>[p.id,Number(p.role==='mafia')]));assert.equal(scoreBeliefs(s,0,truth),0);assert.throws(()=>scoreBeliefs(s,0,{}));
});
test('paid probe adapter records its cost but never alters game memory or public play',async()=>{
 const s=fixed(),before=structuredClone(s),fetch=globalThis.fetch;
 try {
  globalThis.fetch=async(_url,options)=>{
   const request=JSON.parse(options.body);assert.equal(request.model,MODEL);assert.equal(request.reasoning.effort,'medium');assert.equal(request.response_format.json_schema.name,'mafia_beliefs');
   return response({probabilities:s.players.slice(1).map(p=>({id:p.id,pMafia:.25}))});
  };
  const result=await requestTurn(s,0,'probe',{pricing});assert.equal(Object.keys(result.probabilities).length,7);assert.equal(s.usage.calls,1);
  assert.deepEqual(s.players,before.players);assert.deepEqual(s.log,before.log);assert.deepEqual(s.history,before.history);
 }finally{globalThis.fetch=fetch;}
});
