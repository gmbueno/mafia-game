import { writeFileSync, renameSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { runAutomatedGame, gameMetrics, wilson, scoreBeliefs } from '../src/evaluation.js';
import { requestTurn, recordCall, ledgerSummary } from '../src/ai.js';
import { PROTOCOL, MODEL_CONFIG, PROMPT_VERSION } from '../src/protocol.js';
const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const value = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i+1]; };
const live = flag('live'), count = Number(value('games', live ? 1 : 100)), seedStart = Number(value('seed', flag('holdout') ? 100001 : 1));
const variant = value('variant', 'standard');
const variants = { standard: {}, 'no-council': { councilRounds: 0 }, plurality: { ballotMode: 'plurality' } };
if (!variants[variant]) throw new Error('Choose standard, no-council or plurality. Each alternative changes one rule.');
if (!Number.isInteger(count) || count < 1 || count > 10000 || !Number.isInteger(seedStart) || seedStart < 0 || seedStart + count > 4294967296) throw new Error('Invalid game count or seed range.');
if (flag('holdout') && seedStart < 100001) throw new Error('Reserved holdout seeds begin at 100001.');
const budget = { maxUsd: Number(value('max-usd', NaN)), maxCalls: Number(value('max-calls', NaN)) };
if (live && (!process.env.OPENROUTER_API_KEY || !flag('max-usd') || !flag('max-calls') || !flag('games') || count > 2 || !(budget.maxUsd > 0 && budget.maxUsd <= 2) || !Number.isInteger(budget.maxCalls) || budget.maxCalls < 1 || budget.maxCalls > 200)) {
  throw new Error('Live testing requires an environment key and explicit --games (1–2), --max-calls (1–200), --max-usd (up to $2). Only GPT-6.1 Sol medium is supported. No request sent.');
}
const path = value('output', `output/benchmark-${new Date().toISOString().replaceAll(':','-')}`);
await mkdir(path, { recursive: true });
const ledger = [], games = [], probes = [];
const sourceHashes = {};
for (const file of ['src/game.js','src/ai.js','src/protocol.js','src/evaluation.js','scripts/benchmark.mjs']) sourceHashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
let commit = 'unavailable'; try { commit = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(); } catch {}
const report = { sourceHashes, protocol: PROTOCOL, promptVersion: PROMPT_VERSION, modelConfig: live ? MODEL_CONFIG : null, commit,
  startedAt: new Date().toISOString(), mode: live ? 'live-pilot' : 'random-policy', variant, seedStart, requestedGames: count,
  split: flag('holdout') ? 'holdout' : 'development', budget: live ? budget : null, beliefProbes: flag('probes'), probes,
  limitations: 'Random-policy results do not measure model ability. Live pilots are capped smoke tests, not a ranking. Incomplete games remain in the report. Personas are off; all eight seats are automated. Seeds reproduce setup, not API sampling.', games };
for (let i = 0; i < count; i++) {
  const seed = seedStart + i;
  const persist = state => {
    if (live || flag('traces')) { const file = `${path}/game-${seed}.json`; writeFileSync(`${file}.tmp`, JSON.stringify(state)); renameSync(`${file}.tmp`, file); }
  };
  const checkpoint = async state => persist(state);
  const result = await runAutomatedGame({ seed, options: variants[variant], checkpoint,
    beforeNominations: live && flag('probes') ? async (snapshot, state) => {
      for (const actor of snapshot.players.filter(p => p.alive && p.role !== 'mafia')) {
        try {
          const result = await requestTurn(snapshot, actor.id, 'probe', { key: process.env.OPENROUTER_API_KEY, ledger, budget,
            onAttempt: entry => { ledger.push(entry); recordCall(state, entry); persist(state); },
          });
          probes.push({ seed, day: snapshot.day, actor: actor.id, probabilities: result.probabilities, brier: scoreBeliefs(snapshot, actor.id, result.probabilities), attemptId: result.attemptId });
        } catch (error) { probes.push({ seed, day: snapshot.day, actor: actor.id, error: error.message }); throw error; }
      }
    } : undefined,
    choose: live ? async (snapshot, id, action, state) => requestTurn(snapshot, id, action, {
      key: process.env.OPENROUTER_API_KEY, ledger, budget,
      onAttempt: entry => { ledger.push(entry); recordCall(state, entry); persist(state); },
    }) : undefined,
  });
  games.push({ seed, status: result.status, reason: result.reason, ...gameMetrics(result.state) });
  await writeFile(`${path}/report.json`, JSON.stringify(report, null, 2));
  if (live && result.status !== 'completed') break;
}
const completed = games.filter(g => g.status === 'completed');
const mafiaWins = completed.filter(g => g.winner === 'Mafia').length;
report.summary = { completed: completed.length, incomplete: games.length - completed.length, mafiaWins,
  mafiaWinRate: completed.length ? mafiaWins / completed.length : null,
  mafiaWinRate95CI: wilson(mafiaWins, completed.length), usage: ledgerSummary(ledger),
  caution: 'Confidence intervals use independent games, not individual turns. Do not interpret a tiny live pilot as an estimate of strategic ability.' };
await writeFile(`${path}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ path, mode: report.mode, ...report.summary }, null, 2));
