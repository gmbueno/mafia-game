import { createGame, currentSpeaker, startDiscussion, speak, whisper, alive, legalTargets, resolveNominations, resolveVotes, startNight, resolveNight, nextDay, remember, agentView } from './game.js';
import { seededRandom } from './protocol.js';
export function randomPolicy(seed) {
  const random = seededRandom(seed ^ 0x9e3779b9);
  return async (state, id, action) => {
    const options = legalTargets(state, id, action);
    const target = ['speech', 'council'].includes(action) ? -1 : options[Math.floor(random() * options.length)];
    return { target, speech: ['speech', 'council', 'nomination'].includes(action) && (action !== 'nomination' || target !== -1) ? 'This is an uninformed random-policy test.' : '', memory: '' };
  };
}
export async function runAutomatedGame({ seed, options = {}, choose, checkpoint = () => {}, beforeNominations = () => {} }) {
  const state = createGame('Alex', 'random', seed, { ...options, personas: false });
  choose ||= randomPolicy(seed);
  try {
    startDiscussion(state);
    while (!state.winner) {
      if (['discussion', 'defense', 'council'].includes(state.phase)) {
        const id = currentSpeaker(state), action = state.phase === 'council' ? 'council' : 'speech';
        const turn = await choose(structuredClone(state), id, action, state);
        remember(state, id, turn.memory);
        if (action === 'council') whisper(state, id, turn.speech); else speak(state, id, turn.speech);
      } else if (['nomination', 'vote', 'night'].includes(state.phase)) {
        if (state.phase === 'nomination') await beforeNominations(structuredClone(state), state);
        const snapshot = structuredClone(state), action = state.phase, results = [];
        // Sequential transport limits concurrent spend; each actor still receives the SAME snapshot.
        for (const p of alive(snapshot).filter(p => action !== 'night' || p.role !== 'civilian')) {
          const turn = await choose(snapshot, p.id, action, state);
          results.push({ id: p.id, ...turn });
        }
        for (const turn of results) remember(state, turn.id, turn.memory);
        if (action === 'nomination') resolveNominations(state, results);
        else if (action === 'vote') resolveVotes(state, results);
        else resolveNight(state, results);
      } else if (state.phase === 'verdict') startNight(state);
      else if (state.phase === 'dawn') nextDay(state);
      else throw new Error(`Unexpected phase: ${state.phase}`);
      await checkpoint(state);
    }
    return { status: 'completed', state };
  } catch (error) {
    await checkpoint(state);
    return { status: 'incomplete', reason: error.message, state };
  }
}
export function gameMetrics(state) {
  const votes = state.log.filter(e => e.type === 'ballots');
  const nominations = state.log.filter(e => e.type === 'nominations');
  const finishes = state.calls.filter(e => e.stage === 'finished');
  const daysWithoutExecution = state.log.filter(e => e.type === 'event' && /No one is eliminated\./.test(e.text)).length;
  return {
    winner: state.winner, days: state.day, voteRounds: votes.length, daysWithoutExecution,
    abstentions: votes.reduce((n,e) => n + e.ballots.filter(b => b.target === -1).length, 0),
    ballots: votes.reduce((n,e) => n + e.ballots.length, 0), nominationRounds: nominations.length,
    calls: state.usage.calls, reportedCost: state.usage.cost, reservedCost: state.usage.reserved || 0,
    invalidTurns: finishes.filter(e => e.outcome === 'invalid').length,
    truncatedTurns: finishes.filter(e => e.outcome === 'truncated').length,
    clippedTurns: finishes.filter(e => e.outcome === 'accepted_clipped').length,
    failedAttempts: finishes.filter(e => !e.outcome.startsWith('accepted')).length,
    meanLatencyMs: finishes.length ? finishes.reduce((n,e) => n + e.durationMs, 0) / finishes.length : null,
  };
}
export function wilson(wins, n) {
  if (!n) return null;
  const z = 1.959963984540054, p = wins/n, d = 1 + z*z/n;
  const center = (p + z*z/(2*n))/d, delta = z*Math.sqrt(p*(1-p)/n + z*z/(4*n*n))/d;
  return [center-delta, center+delta];
}
// Pure fork specification: it never mutates memory, game state or the public transcript.
// Not executed by the runner. Paid belief probes require an explicit future experiment.
export function beliefProbe(state, id) {
  const view = agentView(structuredClone(state), id, 'belief-probe');
  return { view, question: 'For each other living player, report the probability (0 to 1) that they are Mafia. No explanation. This assessment will not be fed back into the game.' };
}
export function scoreBeliefs(state, actor, probabilities) {
  const targets = alive(state).filter(p => p.id !== actor);
  if (targets.some(p => !Number.isFinite(probabilities[p.id]) || probabilities[p.id] < 0 || probabilities[p.id] > 1)) throw new Error('Incomplete or invalid belief probabilities.');
  return targets.reduce((n,p) => n + (probabilities[p.id] - Number(p.role === 'mafia')) ** 2, 0) / targets.length;
}
