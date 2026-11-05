import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createGame} from '../src/game.js';
const base = process.env.TEST_URL || 'http://127.0.0.1:5174';
const browser = await chromium.launch({headless:true,channel:'chromium'});
const page = await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await fs.mkdir('output/qa',{recursive:true});
await page.goto(base);await page.evaluate(()=>document.fonts.ready);
await page.screenshot({path:'output/qa/lobby-desktop.png',fullPage:true});
assert.equal(await page.locator('[data-seat]').count(),8);
await page.getByRole('button',{name:'How to play'}).click();await page.getByRole('dialog').waitFor();
await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
await page.locator('#player-name').fill('Alex');await page.locator('[data-role="detective"]').click();
await page.getByRole('button',{name:'Try a practice game'}).click();
let state=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
assert.equal((await state()).self.role,'detective');
await page.locator('[data-action="begin"]').click();
// Keep turn advancement explicit so the test can exercise every phase.
await page.locator('[data-action="auto"]').click();
let guard=0;
while((await state()).phase!=='ended' && guard++<1200){
 const s=await state();
 assert.ok(!s.error,s.error);
 if(s.busy){await page.waitForTimeout(120);continue;}
 if(['discussion','defense'].includes(s.phase)){
  if(s.currentSpeaker===0){
   await page.locator('#speech').fill('I want a clear reason for that accusation. Let’s compare everyone’s votes.');
   await page.locator('#speech-form').evaluate(el=>el.requestSubmit());
   if(s.phase==='discussion'&&s.day===1)await page.screenshot({path:'output/qa/discussion-desktop.png',fullPage:true});
  }else await page.locator('[data-action="continue"]').click();
 }else if(s.phase==='vote'){
  if(s.self.alive){await page.locator('[data-action="abstain"]').click();}
  await page.locator('[data-action="vote"]').click();
 }else if(s.phase==='verdict'){
  await page.screenshot({path:'output/qa/verdict.png',fullPage:true});
  await page.locator('[data-action="night"]').click();
 }else if(s.phase==='night'){
  if(s.legalTargets.length)await page.locator(`[data-seat="${s.legalTargets[0]}"]`).click();
  await page.screenshot({path:'output/qa/night.png',fullPage:true});
  await page.locator('[data-action="sleep"]').click();
 }else if(s.phase==='dawn'){
  await page.locator('[data-tab="notebook"]').click();
  await page.locator('#notes').fill('Private note: compare voting patterns.');
  await page.screenshot({path:'output/qa/notebook.png',fullPage:true});
  await page.locator('[data-tab="discussion"]').click();
  await page.locator('[data-action="day"]').click();
 }else throw new Error(`Unexpected phase ${s.phase}`);
}
assert.equal((await state()).phase,'ended','complete game must reach a winner');
await page.screenshot({path:'output/qa/ended.png',fullPage:true});
const finished=await state();
assert.ok(finished.players.every(p=>p.role),'game end reveals all roles');
await page.reload();assert.equal((await state()).winner,finished.winner,'resume after reload');
await page.locator('[data-action="new"]').last().click();await page.locator('[data-action="reset"]').click();
// Check direct live API wiring with deterministic mocked transport, including retry.
let calls=0, first=true;
await page.route('**/api/local-completion',async route=>{
 calls++;const req=route.request().postDataJSON();
 assert.equal(req.model,'openai/gpt-6.1-sol');assert.equal(req.reasoning.effort,'medium');
 const view=JSON.parse(req.messages[1].content);
 assert.ok(view.players.every(p=>p.revealedRole||!('role'in p)));
 if(first){first=false;await route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({error:{message:'rate limit'}})});return;}
 await route.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{message:{content:JSON.stringify({speech:'Let’s hear a specific reason before we pick a suspect.',target:-1,memory:'I asked for specific evidence.'})}}],usage:{total_tokens:100,cost:.001}})});
});
await page.locator('#start-btn').click();await page.locator('[data-action="begin"]').click();
await page.locator('[data-action="continue"]').click();
await page.getByRole('button',{name:'Retry',exact:false}).waitFor();
await page.getByRole('button',{name:'Retry',exact:false}).click();
await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).log.some(e=>e.type==='speech'));
if(await page.locator('[data-action="auto"]').getAttribute('title') === 'Pause automatic turns') await page.locator('[data-action="auto"]').click();
assert.ok(calls>=2);
assert.equal((await state()).error,'');
// Seat zero, flagging, tab notes, connection dialog, all non-game navigation.
await page.locator('[data-seat="0"]').click();assert.equal(await page.getByRole('dialog').count(),1);await page.keyboard.press('Escape');
await page.locator('[data-seat="3"]').click();await page.getByRole('button',{name:'Mark as suspicious'}).click();
assert.equal(await page.locator('.suspicion-mark').count(),1);
await page.locator('[data-tab="notebook"]').click();await page.locator('#notes').fill('My private note.');
await page.reload();await page.locator('[data-tab="notebook"]').click();assert.equal(await page.locator('#notes').inputValue(),'My private note.');
await page.getByRole('button',{name:'Connection settings'}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
// Clean mobile lobby and active game screenshots.
await page.locator('[data-action="new"]').click();await page.locator('[data-action="reset"]').click();
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/qa/lobby-mobile.png',fullPage:true});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
await page.getByRole('button',{name:'Try a practice game'}).click();await page.screenshot({path:'output/qa/reveal-mobile.png',fullPage:true});
await page.locator('[data-action="begin"]').click();await page.locator('[data-action="auto"]').click();
await page.screenshot({path:'output/qa/game-mobile.png',fullPage:true});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
assert.deepEqual(errors,[]);
console.log(JSON.stringify({result:'PASS',winner:finished.winner,days:finished.day,uiActions:guard,mockedLiveCalls:calls,consoleErrors:errors}));
await browser.close();
