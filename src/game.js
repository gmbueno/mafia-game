import { PROTOCOL, DEFAULT_OPTIONS, LIMITS, limitWords } from './protocol.js';
export const CAST = [
  { name: 'You', trait: '', style: 'You', personality: '' },
  { name: 'Theo', trait: 'Sharp Analyst', style: 'The analyst', personality: 'Measured and analytical. Track voting patterns and distinguish evidence from assumptions. Speak plainly, never use numerical probabilities.' },
  { name: 'Cleo', trait: 'Provocateur', style: 'The wildcard', personality: 'Playful and provocative. Test reactions with pointed questions. Change your mind when the evidence warrants it.' },
  { name: 'Miles', trait: 'Skeptical', style: 'The skeptic', personality: 'Dry, skeptical and observant. Challenge easy consensus and ask people to explain contradictions.' },
  { name: 'June', trait: 'Mediator', style: 'The diplomat', personality: 'Calm and persuasive. Build coalitions, draw out quieter players and hold people to their earlier statements.' },
  { name: 'Oscar', trait: 'Aggressive Voter', style: 'The challenger', personality: 'Direct and confident. Make specific accusations, push decisive votes, and defend your reads. Avoid being needlessly abrasive.' },
  { name: 'Iris', trait: 'Quiet Observer', style: 'The observer', personality: 'Quiet, precise and perceptive. Notice inconsistencies and small shifts in stories. Keep your remarks concise.' },
  { name: 'Felix', trait: 'Steady Defender', style: 'The charmer', personality: 'Warm, grounded and quick-witted. Read social dynamics, steady the table against rushed votes, and win trust with specific observations rather than flattery.' },
];
export const ROLES = {
  civilian: { name: 'Civilian', team: 'Town', icon: 'town', text: 'Find the Mafia. Make your vote count.' },
  mafia: { name: 'Mafia', team: 'Mafia', icon: 'mask', text: 'Blend in by day. Choose a target at night.' },
  detective: { name: 'Detective', team: 'Town', icon: 'search', text: 'Investigate one player each night.' },
  doctor: { name: 'Doctor', team: 'Town', icon: 'heart', text: 'Protect one player each night. No repeats.' },
};
export const RULES = 'Eight players: 2 Mafia, 1 Detective, 1 Doctor, 4 Civilians. Day first. Public statements are claims, not verified facts. Roles reveal on death; dead players cannot act. Doctor protects one living player (self allowed, no consecutive repeats). Detective learns Mafia or Town for one other living player. Night actions resolve simultaneously, including actions by a player killed that night. Town wins with no Mafia; Mafia win at parity. Draw after 15 days.';
export function rulesFor(s) {
  return RULES + (s.options.ballotMode === 'nomination'
    ? ' Each day: one discussion turn per living player, simultaneous nominations with reasons, then the most-nominated player alone defends before a simultaneous ballot. Tied nominations use the seeded draw. No nominations means no execution. Vote for the nominee to execute or -1 to spare; execution needs more than half of all living players. The nominee cannot vote for themselves. No speeches follow their defense.'
    : ' Each day: discussion, then one final speech per living player, then simultaneous plurality ballots. No self-votes. Ties or an abstention plurality eliminate nobody.')
    + ` Before night actions, living Mafia have ${s.options.councilRounds} private conversation rounds. Each sees only messages addressed to them. Mafia then nominate victims simultaneously; split targets use a rotating living leader. Each spoken turn is at most ${LIMITS.speech} words.`;
}
const shuffle = (items, random) => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
function draw(s) { s.rng = (Math.imul(1664525, s.rng) + 1013904223) >>> 0; return s.rng / 4294967296; }
function record(s, command, args = [], audience = 'public') {
  s.history.push({ seq: s.history.length + 1, day: s.day, phase: s.phase, command, args: structuredClone(args), audience });
}
export function createGame(name = 'You', chosen = 'random', seed = globalThis.crypto?.getRandomValues(new Uint32Array(1))[0] ?? Date.now(), options = {}) {
  if (chosen !== 'random' && !ROLES[chosen]) throw new Error('Invalid role.');
  if (typeof seed === 'function') seed = Math.floor(seed() * 4294967296);
  seed = Number(seed) >>> 0;
  const config = { ...DEFAULT_OPTIONS, ...options };
  if (!['nomination', 'plurality'].includes(config.ballotMode) || ![0, 2].includes(config.councilRounds)) throw new Error('Invalid protocol options.');
  const s = {
    version: 2, protocol: PROTOCOL, id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
    setup: { name: name.trim().slice(0, 20) || 'You', chosen, seed, options: config }, options: config, rng: seed,
    phase: 'reveal', day: 1, log: [], history: [], calls: [], council: [], cursor: 0, order: [], ballots: [], nominee: null,
    winner: null, notes: '', usage: { calls: 0, tokens: 0, cost: 0, unknown: 0 },
  };
  const deck = ['mafia', 'mafia', 'detective', 'doctor', 'civilian', 'civilian', 'civilian', 'civilian'];
  let roles;
  if (chosen === 'random') roles = shuffle(deck, () => draw(s));
  else { deck.splice(deck.indexOf(chosen), 1); roles = [chosen, ...shuffle(deck, () => draw(s))]; }
  const personalities = config.personas ? shuffle(CAST.slice(1), () => draw(s)) : CAST.slice(1).map(p => ({ ...p, personality: '' }));
  s.players = [CAST[0], ...personalities].map((p, id) => ({ ...p, id, name: id === 0 ? s.setup.name : p.name, role: roles[id], alive: true, memory: '', intel: [], lastProtected: null }));
  event(s, 'The roles are dealt. Day 1 begins.');
  return s;
}
export function event(s, text) { s.log.push({ type: 'event', day: s.day, phase: s.phase, text }); }
export const alive = s => s.players.filter(p => p.alive);
export const currentSpeaker = s => ['discussion', 'defense', 'council'].includes(s.phase) ? s.order[s.cursor] : null;
function discussion(s) {
  s.phase = 'discussion'; s.cursor = 0; s.nominee = null;
  const ids = alive(s).map(p => p.id);
  s.order = s.options.randomOrder ? shuffle(ids, () => draw(s)) : ids;
  event(s, `Day ${s.day} · Discussion`);
}
export function startDiscussion(s) {
  if (s.phase !== 'reveal') throw new Error('Discussion has already started.');
  discussion(s); record(s, 'startDiscussion');
}
export function speak(s, id, text) {
  if (!['discussion', 'defense'].includes(s.phase) || currentSpeaker(s) !== id || !s.players[id].alive) throw new Error('It is not this player’s turn.');
  if (!text.trim()) throw new Error('Say something or pass.');
  text = limitWords(text, LIMITS.speech);
  s.log.push({ type: 'speech', day: s.day, phase: s.phase, id, text });
  s.cursor++;
  if (s.cursor >= s.order.length) {
    s.cursor = 0;
    if (s.phase === 'discussion' && s.options.ballotMode === 'nomination') {
      s.phase = 'nomination'; event(s, 'Nominate a suspect, or pass.');
    } else if (s.phase === 'discussion') {
      s.phase = 'defense'; event(s, 'Final words. One last chance to make your case.');
    } else { s.phase = 'vote'; event(s, 'The ballot is open.'); }
  }
  record(s, 'speak', [id, text]);
}
export function legalTargets(s, id, action) {
  const p = s.players[id];
  if (!p?.alive) return [];
  const people = alive(s);
  if (action === 'vote' && s.options.ballotMode === 'nomination') return s.nominee === null || s.nominee === id ? [-1] : [-1, s.nominee];
  if (action === 'vote' || action === 'nomination') return [-1, ...people.filter(x => x.id !== id).map(x => x.id)];
  if (action === 'night') {
    if (p.role === 'mafia') return people.filter(x => x.role !== 'mafia').map(x => x.id);
    if (p.role === 'doctor') return people.filter(x => x.id !== p.lastProtected).map(x => x.id);
    if (p.role === 'detective') return people.filter(x => x.id !== id).map(x => x.id);
  }
  return [];
}
function validate(s, actions, kind, actors = alive(s)) {
  if (actions.length !== actors.length || new Set(actions.map(a => a.id)).size !== actors.length || actions.some(a => !actors.some(p => p.id === a.id) || !legalTargets(s, a.id, kind).includes(a.target))) throw new Error(`Invalid ${kind} actions.`);
}
export function resolveNominations(s, nominations) {
  if (s.phase !== 'nomination') throw new Error('Nominations are not open.');
  validate(s, nominations, 'nomination');
  if (nominations.some(a => a.target !== -1 && (typeof a.speech !== 'string' || !a.speech.trim()))) throw new Error('A nomination needs a reason.');
  const choices = nominations.map(a => ({ id: a.id, target: a.target, speech: a.target === -1 ? '' : limitWords(a.speech, LIMITS.speech) }));
  const counts = new Map();
  for (const a of choices) if (a.target !== -1) counts.set(a.target, (counts.get(a.target) || 0) + 1);
  s.log.push({ type: 'nominations', day: s.day, phase: s.phase, nominations: choices });
  if (!counts.size) { s.phase = 'verdict'; event(s, 'No nominations. No one is eliminated.'); }
  else {
    const top = Math.max(...counts.values()), tied = [...counts].filter(([, n]) => n === top).map(([id]) => id).sort((a,b) => a-b);
    s.nominee = tied[Math.floor(draw(s) * tied.length)]; s.order = [s.nominee]; s.cursor = 0; s.phase = 'defense';
    event(s, `${s.players[s.nominee].name} is nominated${tied.length > 1 ? ' by the tie draw' : ''}. Their defense comes before the vote.`);
  }
  record(s, 'resolveNominations', [choices]);
}
export function checkWinner(s) {
  const mafia = alive(s).filter(p => p.role === 'mafia').length;
  if (mafia === 0) s.winner = 'Town';
  else if (mafia >= alive(s).length - mafia) s.winner = 'Mafia';
  if (s.winner) { s.phase = 'ended'; event(s, `${s.winner} wins.`); }
  return s.winner;
}
function eliminate(s, id, reason) {
  const p = s.players[id]; p.alive = false;
  event(s, `${p.name} ${reason}. They were ${p.role === 'mafia' ? 'Mafia' : `a ${ROLES[p.role].name}`}.`);
}
export function resolveVotes(s, ballots) {
  if (s.phase !== 'vote') throw new Error('The ballot is not open.');
  validate(s, ballots, 'vote');
  s.ballots = ballots.map(b => ({ id: b.id, target: b.target }));
  s.log.push({ type: 'ballots', day: s.day, phase: s.phase, ballots: structuredClone(s.ballots) });
  s.phase = 'verdict';
  if (s.options.ballotMode === 'nomination') {
    if (s.nominee !== null && ballots.filter(b => b.target === s.nominee).length > alive(s).length / 2) eliminate(s, s.nominee, 'was voted out');
    else event(s, 'No majority to execute. No one is eliminated.');
  } else {
    const counts = new Map();
    for (const b of ballots) counts.set(b.target, (counts.get(b.target) || 0) + 1);
    const top = Math.max(...counts.values()), leaders = [...counts].filter(([, n]) => n === top).map(([id]) => id);
    if (leaders.length === 1 && leaders[0] !== -1) eliminate(s, leaders[0], 'was voted out');
    else event(s, leaders.length > 1 ? 'The vote is tied. No one is eliminated.' : 'The town abstained. No one is eliminated.');
  }
  checkWinner(s); record(s, 'resolveVotes', [s.ballots]);
}
export function startNight(s) {
  if (s.phase !== 'verdict') throw new Error('Cannot start night yet.');
  const mafia = alive(s).filter(p => p.role === 'mafia').map(p => p.id);
  s.cursor = 0;
  const order = shuffle(mafia, () => draw(s));
  s.order = Array.from({ length: s.options.councilRounds }, () => order).flat();
  s.phase = s.order.length && mafia.length > 1 ? 'council' : 'night';
  event(s, `Night ${s.day} falls.`); record(s, 'startNight');
}
export function whisper(s, id, text) {
  if (s.phase !== 'council' || currentSpeaker(s) !== id || s.players[id]?.role !== 'mafia' || !s.players[id].alive) throw new Error('Not your private turn.');
  if (!text.trim()) throw new Error('Say something or pass.');
  const audience = alive(s).filter(p => p.role === 'mafia').map(p => p.id);
  text = limitWords(text, LIMITS.speech);
  s.council.push({ day: s.day, id, text, audience });
  s.cursor++;
  if (s.cursor >= s.order.length) { s.cursor = 0; s.phase = 'night'; }
  record(s, 'whisper', [id, text], audience);
}
export function resolveNight(s, actions) {
  if (s.phase !== 'night') throw new Error('It is not night.');
  validate(s, actions, 'night', alive(s).filter(p => p.role !== 'civilian'));
  const mafia = actions.filter(a => s.players[a.id].role === 'mafia').sort((a, b) => a.id - b.id);
  const target = mafia[(s.day - 1) % mafia.length]?.target;
  const doctor = actions.find(a => s.players[a.id].role === 'doctor');
  const detective = actions.find(a => s.players[a.id].role === 'detective');
  if (doctor) {
    s.players[doctor.id].lastProtected = doctor.target;
    s.players[doctor.id].intel.push({ day: s.day, text: `You protected ${s.players[doctor.target].name}.` });
  }
  if (detective) {
    const p = s.players[detective.target];
    s.players[detective.id].intel.push({ day: s.day, text: `${p.name} is ${p.role === 'mafia' ? 'Mafia' : 'Town'}.` });
  }
  mafia.forEach(a => s.players[a.id].intel.push({ day: s.day, text: `The Mafia targeted ${s.players[target].name}.` }));
  s.phase = 'dawn';
  if (target !== undefined && doctor?.target !== target) eliminate(s, target, 'did not survive the night');
  else event(s, 'Everyone survived the night.');
  checkWinner(s);
  if (!s.winner && s.day >= LIMITS.days) { s.winner = 'Draw'; s.phase = 'ended'; event(s, 'Day limit reached. The game is a draw.'); }
  record(s, 'resolveNight', [actions.map(a => ({ id: a.id, target: a.target }))], 'audit');
}
export function nextDay(s) {
  if (s.phase !== 'dawn') throw new Error('Wait for dawn.');
  s.day++; s.ballots = []; discussion(s); record(s, 'nextDay');
}
export function remember(s, id, memory) {
  s.players[id].memory = limitWords(memory, LIMITS.memory);
  record(s, 'remember', [id, s.players[id].memory], [id]);
}
// The only projection sent to a player. Never send history, calls or the full state.
export function playerView(s, id, action) {
  const p = s.players[id];
  return {
    self: { id, name: p.name, role: p.role, trait: p.trait || '', style: p.style || '', personality: p.personality, memory: p.memory, intel: structuredClone(p.intel) },
    allies: p.role === 'mafia' ? s.players.filter(x => x.role === 'mafia' && x.id !== id).map(x => ({ id: x.id, name: x.name, alive: x.alive })) : [],
    day: s.day, phase: s.phase, action, nominee: s.nominee,
    players: s.players.map(x => ({ id: x.id, name: x.name, alive: x.alive, ...(x.alive ? {} : { revealedRole: x.role }) })),
    publicLog: structuredClone(s.log), privateMessages: structuredClone(s.council.filter(e => e.audience.includes(id))),
    legalTargets: legalTargets(s, id, action),
  };
}
export function agentView(s, id, action) {
  if (!s.players[id]?.alive) throw new Error('Only living players can act.');
  return playerView(s, id, action);
}
const commands = { startDiscussion, speak, resolveNominations, resolveVotes, startNight, whisper, resolveNight, nextDay, remember };
export function replayAt(source, count = source.history.length) {
  if (source.protocol !== PROTOCOL) throw new Error('Unsupported replay protocol.');
  const { name, chosen, seed, options } = source.setup;
  const state = createGame(name, chosen, seed, options); state.id = source.id;
  for (const e of source.history.slice(0, count)) {
    if (!commands[e.command]) throw new Error('Unknown replay event.');
    commands[e.command](state, ...structuredClone(e.args));
  }
  return state;
}
export function exportGame(s) {
  if (!s.winner) throw new Error('Full audit export unlocks after the game.');
  return structuredClone({ format: 'mafia-audit-1', protocol: s.protocol, id: s.id, setup: s.setup,
    history: s.history, calls: s.calls, usage: s.usage, winner: s.winner, practice: Boolean(s.practice) });
}
const clampSuspicion = v => Math.max(-3, Math.min(3, v));
const ACCUSE_RE = /\b(suspect|suspicious|mafia|guilty|accuse|nominate|vote|lying|lie|evasive|contradict\w*|inconsistent|shady|watch(?:ing)?|pressure|account|explain|pushed|distrust|doubt|don['’]t trust|not clear|hard to trust)\b/i;
const DEFEND_RE = /\b(trust|clear(?:ed)?|innocent|defend(?:ing)?|believe|agree|steady|reasonable|spare|town)\b/i;
const PRONOUN_NAMES = new Set(['you', 'me', 'i', 'we', 'us', 'they', 'them', 'he', 'him', 'she', 'her', 'it']);
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NOM_EVENT_RE = /^(.+?) is nominated(?: by the tie draw)?\. Their defense comes before the vote\.$/;
const ELIM_EVENT_RE = /^(.+?) (was voted out|did not survive the night)\. They were (Mafia|a Civilian|a Detective|a Doctor)\.$/;
// Pure deterministic public-only suspicion evolution (-3 trust to +3 suspicion).
// Reads only player ids/names and public state.log — never hidden roles, memories, intel, council or human notes.
export function computeSuspicionHistory(s) {
  const roster = s.players.map(p => ({ id: p.id, name: p.name }));
  const namePatterns = new Map(roster.filter(p => p.name && !PRONOUN_NAMES.has(p.name.toLowerCase())).map(p => [p.id, new RegExp(`\\b${escapeRegex(p.name)}\\b`, 'i')]));
  const aliveSet = new Set(roster.map(p => p.id));
  const scores = Object.fromEntries(roster.map(a => [a.id, Object.fromEntries(roster.filter(b => b.id !== a.id).map(b => [b.id, 0]))]));
  const adjust = (actor, target, delta) => {
    if (actor === target || !aliveSet.has(actor) || scores[actor]?.[target] === undefined) return;
    scores[actor][target] = clampSuspicion(scores[actor][target] + delta);
  };
  const addSet = (map, key, val) => { if (!map.has(key)) map.set(key, new Set()); map.get(key).add(val); };
  const findByName = name => roster.find(p => p.name === name && aliveSet.has(p.id)) || roster.find(p => p.name === name);
  const maxDay = Math.max(1, s.day || 1, ...s.log.map(e => e.day || 1));
  const snapshots = [];
  for (let day = 1; day <= maxDay; day++) {
    let dayNominee = null;
    const dayNominators = new Map(), dayGuilty = new Map(), daySpared = new Map(), speechTouched = new Set(), eliminated = [];
    for (const e of s.log) {
      if ((e.day || 1) !== day) continue;
      if (e.type === 'speech' && aliveSet.has(e.id)) {
        const accuse = ACCUSE_RE.test(e.text), defend = !accuse && DEFEND_RE.test(e.text);
        if (accuse || defend) {
          for (const target of roster) {
            if (target.id === e.id || !aliveSet.has(target.id)) continue;
            const pattern = namePatterns.get(target.id);
            const key = `${e.id}:${target.id}`;
            if (pattern && !speechTouched.has(key) && pattern.test(e.text)) {
              speechTouched.add(key);
              adjust(e.id, target.id, accuse ? 1 : -1);
            }
          }
        }
      } else if (e.type === 'nominations') {
        for (const n of e.nominations) {
          if (n.target !== -1 && aliveSet.has(n.id)) {
            adjust(n.id, n.target, 2);
            addSet(dayNominators, n.target, n.id);
            if (aliveSet.has(n.target)) adjust(n.target, n.id, 1);
          }
        }
      } else if (e.type === 'ballots') {
        for (const b of e.ballots) {
          if (!aliveSet.has(b.id)) continue;
          if (b.target !== -1) {
            adjust(b.id, b.target, 2);
            addSet(dayGuilty, b.target, b.id);
          } else if (dayNominee !== null && b.id !== dayNominee) {
            adjust(b.id, dayNominee, -1);
            addSet(daySpared, dayNominee, b.id);
          }
        }
      } else if (e.type === 'event') {
        const nom = e.text.match(NOM_EVENT_RE);
        if (nom) { const p = findByName(nom[1]); if (p) dayNominee = p.id; continue; }
        const elim = e.text.match(ELIM_EVENT_RE);
        if (elim) {
          const victim = findByName(elim[1]);
          if (!victim) continue;
          const wasMafia = elim[3] === 'Mafia';
          aliveSet.delete(victim.id);
          eliminated.push({ id: victim.id, how: elim[2] === 'was voted out' ? 'voted' : 'night', revealedRole: elim[3].replace(/^a /, '') });
          const pushers = new Set([...(dayNominators.get(victim.id) || []), ...(dayGuilty.get(victim.id) || [])]);
          const sparers = daySpared.get(victim.id) || new Set();
          for (const observer of aliveSet) {
            for (const pusher of pushers) if (observer !== pusher && aliveSet.has(pusher)) adjust(observer, pusher, wasMafia ? -1 : 1);
            for (const sparer of sparers) if (observer !== sparer && aliveSet.has(sparer)) adjust(observer, sparer, wasMafia ? 1 : -1);
          }
        }
      }
    }
    const aliveIds = [...aliveSet].sort((a, b) => a - b);
    const matrix = Object.fromEntries(aliveIds.map(aid => [aid, { ...scores[aid] }]));
    const averageByTarget = Object.fromEntries(roster.map(target => {
      const raters = aliveIds.filter(aid => aid !== target.id);
      const avg = raters.length ? Math.round((raters.reduce((sum, aid) => sum + scores[aid][target.id], 0) / raters.length) * 100) / 100 : 0;
      return [target.id, avg];
    }));
    const ranked = (aliveIds.length ? aliveIds : roster.map(p => p.id)).map(id => ({ id, score: averageByTarget[id] })).sort((a, b) => b.score - a.score || a.id - b.id);
    snapshots.push({ day, aliveIds, matrix, averageByTarget, eliminated, peakTarget: ranked[0] || null });
  }
  return snapshots;
}
export function getSuspicionMatrix(s) {
  return computeSuspicionHistory(s).at(-1);
}
// Pure deterministic turning-point chronicle for completed games. Never reads private notes, AI notebooks, or API credentials.
export function buildChronicle(s) {
  if (!s?.winner) return [];
  const roster = s.players.map(p => ({ id: p.id, name: p.name }));
  const byName = name => roster.find(p => p.name === name);
  const nomByDay = new Map(), ballotSummaries = [], eliminations = [], saves = [];
  for (const e of s.log) {
    const day = e.day || 1;
    if (e.type === 'nominations') {
      const counts = new Map();
      for (const n of e.nominations) if (n.target !== -1) counts.set(n.target, (counts.get(n.target) || 0) + 1);
      nomByDay.set(day, { counts, nomineeId: null, nomineeName: null });
    } else if (e.type === 'event') {
      const nom = e.text.match(NOM_EVENT_RE);
      if (nom) {
        const p = byName(nom[1]);
        const entry = nomByDay.get(day) || { counts: new Map(), nomineeId: null, nomineeName: null };
        entry.nomineeId = p?.id ?? null; entry.nomineeName = nom[1];
        nomByDay.set(day, entry);
        continue;
      }
      const elim = e.text.match(ELIM_EVENT_RE);
      if (elim) {
        const role = elim[3].replace(/^a /, '');
        eliminations.push({ day, how: elim[2] === 'was voted out' ? 'voted' : 'night', name: elim[1], role, wasMafia: role === 'Mafia', id: byName(elim[1])?.id ?? null });
        continue;
      }
      if (e.text === 'Everyone survived the night.') saves.push({ day });
    } else if (e.type === 'ballots') {
      const nom = nomByDay.get(day);
      if (nom?.nomineeId !== null && nom?.nomineeId !== undefined) {
        const forVotes = e.ballots.filter(b => b.target === nom.nomineeId).length;
        const spareVotes = e.ballots.length - forVotes;
        const needed = Math.floor(e.ballots.length / 2) + 1;
        ballotSummaries.push({ day, mode: 'nomination', nomineeId: nom.nomineeId, nomineeName: nom.nomineeName, forVotes, spareVotes, executed: forVotes >= needed, closeness: Math.abs(forVotes - needed) * 2 + Math.abs(forVotes - spareVotes) });
      } else {
        const counts = new Map();
        for (const b of e.ballots) if (b.target !== -1) counts.set(b.target, (counts.get(b.target) || 0) + 1);
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
        const top = sorted[0]?.[1] || 0, second = sorted[1]?.[1] || 0;
        const abstains = e.ballots.filter(b => b.target === -1).length;
        ballotSummaries.push({ day, mode: 'plurality', topId: sorted[0]?.[0] ?? null, topVotes: top, secondVotes: second, abstains, executed: sorted.length > 0 && top > second && top > abstains, closeness: Math.abs(top - Math.max(second, abstains)) });
      }
    }
  }
  const rolePhrase = elim => elim.wasMafia ? 'Mafia' : `a ${elim.role}`;
  const lastElim = eliminations.at(-1);
  const endgame = (() => {
    if (s.winner === 'Draw') return { day: s.day, order: 4, kind: 'endgame', key: `end:${s.day}`, text: `Day ${s.day}: Neither side broke the stalemate after ${s.day} days, ending the match in a draw.` };
    if (s.winner === 'Town') return { day: s.day, order: 4, kind: 'endgame', key: lastElim?.day === s.day && lastElim.how === 'voted' ? `vote:${s.day}` : `end:${s.day}`, text: lastElim && lastElim.day === s.day ? `Day ${s.day}: Voting out ${lastElim.name} removed the last Mafia and sealed the Town victory.` : `Day ${s.day}: Town eliminated both Mafia to claim the table.` };
    return { day: s.day, order: 4, kind: 'endgame', key: lastElim?.day === s.day ? `${lastElim.how}:${s.day}` : `end:${s.day}`, text: lastElim && lastElim.day === s.day ? `${lastElim.how === 'night' ? `Night ${s.day}` : `Day ${s.day}`}: ${lastElim.name}’s exit (${lastElim.role}) handed Mafia parity and the win.` : `Day ${s.day}: Mafia reached parity to take the table.` };
  })();
  const day1Elim = eliminations.find(e => e.day === 1 && e.how === 'voted');
  const day1Ballot = ballotSummaries.find(b => b.day === 1);
  const day1Nom = nomByDay.get(1);
  let opening;
  if (day1Elim && endgame.key !== 'vote:1') {
    opening = { day: 1, order: 1, kind: 'opening', key: 'vote:1', text: `Day 1: ${day1Elim.name} was the first player voted out, revealing ${rolePhrase(day1Elim)}.` };
  } else if (day1Ballot && day1Ballot.mode === 'nomination' && !day1Ballot.executed) {
    opening = { day: 1, order: 1, kind: 'opening', key: 'vote:1', text: `Day 1: ${day1Ballot.nomineeName} drew the opening nomination but survived the ballot (${day1Ballot.forVotes}–${day1Ballot.spareVotes}).` };
  } else if (day1Nom?.nomineeName) {
    const count = day1Nom.counts.get(day1Nom.nomineeId) || 1;
    opening = { day: 1, order: 1, kind: 'opening', key: 'nom:1', text: `Day 1: ${day1Nom.nomineeName} drew ${count} opening nomination${count > 1 ? 's' : ''} to set the early pressure.` };
  } else if (s.log.some(e => e.day === 1 && e.type === 'event' && /No one is eliminated\./.test(e.text))) {
    opening = { day: 1, order: 1, kind: 'opening', key: 'vote:1', text: 'Day 1: The opening day ended with no execution as the table held its fire.' };
  } else {
    opening = { day: 1, order: 1, kind: 'opening', key: 'open:1', text: 'Day 1: Eight players took the table with two hidden Mafia.' };
  }
  const chosen = [opening, endgame];
  const usedKeys = new Set(chosen.map(c => c.key));
  const middle = [];
  const powerKills = eliminations.filter(e => e.how === 'night' && (e.role === 'Detective' || e.role === 'Doctor')).sort((a, b) => (a.role === 'Detective' ? 0 : 1) - (b.role === 'Detective' ? 0 : 1) || a.day - b.day);
  if (powerKills.length) {
    const k = powerKills[0];
    middle.push({ day: k.day, order: 3, kind: 'night-strike', key: `night:${k.day}`, text: `Night ${k.day}: The Mafia struck a key Town role, eliminating ${k.name} (${k.role}).` });
  }
  const mafiaBallots = eliminations.filter(e => e.how === 'voted' && e.wasMafia);
  for (const m of mafiaBallots) {
    middle.push({ day: m.day, order: 2, kind: 'mafia-caught', key: `vote:${m.day}`, text: `Day ${m.day}: The table unmasked ${m.name} as Mafia at the ballot.` });
  }
  const swingCandidates = [...ballotSummaries].sort((a, b) => a.closeness - b.closeness || a.day - b.day);
  for (const b of swingCandidates) {
    const elim = eliminations.find(e => e.day === b.day && e.how === 'voted');
    const text = b.mode === 'nomination'
      ? (b.executed
        ? `Day ${b.day}: A ${b.forVotes}–${b.spareVotes} ballot crossed the majority to execute ${b.nomineeName}${elim ? ` (${elim.role})` : ''}.`
        : `Day ${b.day}: ${b.nomineeName} survived a ${b.forVotes}–${b.spareVotes} vote swing, keeping the table in play.`)
      : (elim
        ? `Day ${b.day}: A close plurality ballot eliminated ${elim.name} as ${rolePhrase(elim)}.`
        : `Day ${b.day}: A split ballot ended without an execution, shifting momentum into the night.`);
    middle.push({ day: b.day, order: 2, kind: 'vote-swing', key: `vote:${b.day}`, text });
  }
  if (saves.length) {
    const sv = saves[0];
    middle.push({ day: sv.day, order: 3, kind: 'night-save', key: `night:${sv.day}`, text: `Night ${sv.day}: Everyone survived the night, denying the Mafia a kill.` });
  }
  for (const item of middle) {
    if (chosen.length >= 4) break;
    if (usedKeys.has(item.key)) continue;
    usedKeys.add(item.key);
    chosen.push(item);
  }
  return chosen.sort((a, b) => a.day - b.day || a.order - b.order).map(({ day, kind, text }) => ({ day, kind, text }));
}
export function formatChronicle(s) {
  const points = buildChronicle(s);
  if (!points.length) return '';
  const header = `Mafia Match Chronicle — ${s.winner === 'Draw' ? `Draw (Day ${s.day})` : `${s.winner} wins (Day ${s.day})`}`;
  return [header, ...points.map(p => `• ${p.text}`)].join('\n');
}
