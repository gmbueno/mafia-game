import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base = process.env.TEST_URL || 'http://127.0.0.1:5174';
const browser = await chromium.launch({headless:true,channel:'chromium'});
try {
 const page = await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});
 await page.addInitScript(() => { const native = window.setTimeout; window.setTimeout = (fn, ms, ...args) => native(fn, ms === 550 ? 10 : ms, ...args); });
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await fs.mkdir('output/qa-v2',{recursive:true});
 // All provider transport is intercepted. These tests cannot spend API credits.
 await page.route('**/api/local-status',r=>r.fulfill({json:{available:true}}));
 await page.route('**/api/v1/models',r=>r.fulfill({json:{data:[{id:'openai/gpt-6.1-sol',pricing:{prompt:'0.000001',completion:'0.000002',request:'0'}}]}}));
 let calls=0, failFirst=true;
 const mock = async route=>{
  calls++; const req=route.request().postDataJSON();
  assert.equal(req.model,'openai/gpt-6.1-sol');assert.equal(req.reasoning.effort,'medium');
  const view=JSON.parse(req.messages[1].content);
  assert.ok(view.players.every(p=>!('role'in p)));
  assert.ok(!('calls'in view));assert.ok(!('history'in view));
  if(failFirst){failFirst=false;await route.fulfill({status:429,json:{error:{message:'rate limit'}}});return;}
  const spoken=['speech','council'].includes(view.action);
  const target=spoken?-1:view.legalTargets.at(-1);
  await route.fulfill({json:{model:req.model,id:`mock-${calls}`,choices:[{message:{content:JSON.stringify({speech:spoken||view.action==='nomination'&&target!==-1?'Let’s compare claims with votes before choosing a suspect.':'',target,memory:'Compare votes and claims.'})},finish_reason:'stop'}],usage:{total_tokens:100,cost:.001}}});
 };
 await page.route('**/api/local-completion',mock);
 await page.route('**/api/v1/chat/completions',mock);
 await page.goto(base);await page.evaluate(()=>document.fonts.ready);
 const state=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
 const capture=async name=>{ await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))); return page.screenshot({path:`output/qa-v2/${name}.png`,fullPage:true}); };
 const manual=async()=>{if(await page.locator('[data-action="auto"]').getAttribute('title')==='Pause automatic turns')await page.locator('[data-action="auto"]').click();};
 await capture('lobby');
 await page.getByRole('button',{name:'How to play'}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
 async function play(role){
  await page.locator('#player-name').fill('Alex');await page.locator(`[data-role="${role}"]`).click();
  await page.getByRole('button',{name:'Try a practice game'}).click();await manual();await page.locator('[data-action="begin"]').click();
  const phases=new Set();let guard=0,privateScreenshot=false;
  while((await state()).phase!=='ended' && guard++<1600){
   const s=await state();assert.ok(!s.error,s.error);phases.add(s.phase);
   if(s.phase==='ended')break;
   if(s.busy){await page.waitForTimeout(100);continue;}
   if(['discussion','defense','council'].includes(s.phase)){
    if(s.phase==='defense')assert.equal(s.currentSpeaker,s.nominee);
    if(s.phase==='council'&&role!=='mafia')assert.equal(s.currentSpeaker,null,'Town cannot see Mafia speakers');
    if(s.currentSpeaker===0){
     await page.locator('#speech').fill(s.phase==='council'?'Let’s agree on a target and keep our public claims consistent.':'My claim is consistent with my earlier statements. Compare the votes.');
     await page.locator('#speech-form').evaluate(el=>el.requestSubmit());
    }else await page.locator('[data-action="continue"]').click();
    if(s.phase==='council'&&role==='mafia'&&!privateScreenshot){await capture('mafia-council');privateScreenshot=true;}
   }else if(s.phase==='nomination'){
    if(s.self.alive){
     await page.locator(`[data-seat="${s.legalTargets.find(t=>t!==-1)}"]`).click();
     await page.locator('#speech').fill('This player has not explained their position clearly.');
    }
    await capture(`nomination-${role}`);await page.locator('[data-action="vote"]').click();
   }else if(s.phase==='vote'){
    if(s.self.alive)await page.locator('[data-action="abstain"]').click();
    await page.locator('[data-action="vote"]').click();
   }else if(s.phase==='verdict')await page.locator('[data-action="night"]').click();
   else if(s.phase==='night'){
    if(s.legalTargets.length)await page.locator(`[data-seat="${s.legalTargets[0]}"]`).click();
    await page.locator('[data-action="sleep"]').click();
   }else if(s.phase==='dawn'){
    await page.locator('[data-tab="notebook"]').click();await page.locator('#notes').fill('PRIVATE_HUMAN_NOTE');
    await page.locator('[data-tab="discussion"]').click();await page.locator('[data-action="day"]').click();
   }else throw new Error(`Unexpected phase ${s.phase}`);
  }
  assert.equal((await state()).phase,'ended');assert.ok(phases.has('nomination'));assert.ok(phases.has('defense'));
  await capture(`ended-${role}`);return await state();
 }
 const finished=await play('detective');
 await page.locator('[data-action="replay"]').click();await page.locator('#replay-seat').selectOption('0');
 await page.locator('#replay-step').fill('0');await page.locator('#replay-step').dispatchEvent('input');
 assert.equal(await page.locator('.replay-identities b').filter({hasText:'Unknown'}).count(),7);
 assert.equal(await page.locator('.seat[aria-label*="hidden role"]').count(),7,'the table follows replay perspective');
 await page.setViewportSize({width:390,height:844});await capture('mobile-replay');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.setViewportSize({width:1440,height:960});
 await capture('replay-start');
 await page.locator('#replay-step').fill(await page.locator('#replay-step').getAttribute('max'));await page.locator('#replay-step').dispatchEvent('input');await capture('replay-end');
 const downloadPromise=page.waitForEvent('download');await page.locator('[data-action="export"]').click();const download=await downloadPromise;
 await download.saveAs('output/qa-v2/export.json');const exported=JSON.parse(await fs.readFile('output/qa-v2/export.json','utf8'));
 assert.equal(exported.winner,finished.winner);assert.ok(exported.history.length>10);assert.ok(!JSON.stringify(exported).includes('PRIVATE_HUMAN_NOTE'));
 await page.reload();await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).phase==='ended');
 await page.locator('[data-action="new"]').last().click();await page.locator('[data-action="reset"]').click();
 await page.locator('[data-action="archives"]').click();await page.locator('[data-action="open-archive"]').first().waitFor();assert.ok(await page.locator('[data-action="open-archive"]').count());await page.keyboard.press('Escape');
 await play('mafia');
 await page.locator('[data-action="new"]').last().click();await page.locator('[data-action="reset"]').click();
 // Mocked live failure, retry, ledger persistence and privacy.
 await page.locator('#start-btn').click();await manual();await page.locator('[data-action="begin"]').click();
 if((await state()).currentSpeaker===0)await page.locator('[data-action="pass"]').click();
 await page.locator('[data-action="continue"]').click();await page.getByRole('button',{name:'Retry',exact:false}).waitFor();
 await page.getByRole('button',{name:'Retry',exact:false}).click();await page.waitForFunction(()=>!JSON.parse(window.render_game_to_text()).busy);
 assert.equal((await state()).error,'');assert.equal(calls,2);
 await page.getByRole('button',{name:'Connection settings'}).click();assert.match(await page.locator('.usage-summary').innerText(),/2 attempts/);await page.keyboard.press('Escape');
 await page.locator('[data-tab="notebook"]').click();await page.locator('#notes').fill('Persistence test');await page.waitForTimeout(150);await page.reload();
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='live');await manual();await page.locator('[data-tab="notebook"]').click();assert.equal(await page.locator('#notes').inputValue(),'Persistence test');
 // Spend guard prevents transport entirely, even in a parallel phase.
 await page.getByRole('button',{name:'Connection settings'}).click();await page.locator('#budget').fill('0.05');await page.locator('#key-form').evaluate(el=>el.requestSubmit());
 await page.locator('[data-action="new"]').click();await page.locator('[data-action="reset"]').click();
 await page.setViewportSize({width:390,height:844});await capture('mobile-lobby');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByRole('button',{name:'Try a practice game'}).click();await manual();await page.locator('[data-action="begin"]').click();await capture('mobile-game');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',mockedCalls:calls,consoleErrors:errors,exportEvents:exported.history.length}));
} finally {await browser.close();}
