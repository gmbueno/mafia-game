export const CAST = [
  { name: 'You', style: 'You', personality: '' },
  { name: 'Theo', style: 'The analyst', personality: 'Measured and analytical. Track voting patterns and distinguish evidence from assumptions. Speak plainly, never use numerical probabilities.' },
  { name: 'Cleo', style: 'The wildcard', personality: 'Playful and provocative. Test reactions with pointed questions. Change your mind when the evidence warrants it.' },
  { name: 'Miles', style: 'The skeptic', personality: 'Dry, skeptical and observant. Challenge easy consensus and ask people to explain contradictions.' },
  { name: 'June', style: 'The diplomat', personality: 'Calm and persuasive. Build coalitions, draw out quieter players and hold people to their earlier statements.' },
  { name: 'Oscar', style: 'The challenger', personality: 'Direct and confident. Make specific accusations and defend them. Avoid being needlessly abrasive.' },
  { name: 'Iris', style: 'The observer', personality: 'Quiet, precise and perceptive. Notice inconsistencies and small shifts in stories. Keep your remarks concise.' },
  { name: 'Felix', style: 'The charmer', personality: 'Warm and quick-witted. Read social dynamics and win trust with specific observations rather than flattery.' },
];
export const ROLES = {
  civilian: { name: 'Civilian', team: 'Town', icon: 'town', text: 'Find the Mafia. Make your vote count.' },
  mafia: { name: 'Mafia', team: 'Mafia', icon: 'mask', text: 'Blend in by day. Choose a target at night.' },
  detective: { name: 'Detective', team: 'Town', icon: 'search', text: 'Investigate one player each night.' },
  doctor: { name: 'Doctor', team: 'Town', icon: 'heart', text: 'Protect one player each night. No repeats.' },
};
export const RULES = '8 players: 2 Mafia, 1 Detective, 1 Doctor, 4 Civilians. Start with Day 1. Every day each living player speaks once, then has a final defense. Everyone votes simultaneously; no self-votes, abstention allowed. Unique plurality eliminates; a tie or an abstention win means no elimination. Dead roles are revealed, dead players cannot act. Each night Mafia nominate one non-Mafia victim; if split, a rotating Mafia leader breaks the tie. Doctor protects one living player (self allowed, no consecutive repeats). Detective learns Mafia or Town for one other living player. Night actions are simultaneous. Town wins when no Mafia remain; Mafia win when they equal or outnumber Town. After 15 days without a winner, draw.';
const shuffle = (items, random) => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
export function createGame(name = 'You', chosen = 'random', random = Math.random) {
  if (chosen !== 'random' && !ROLES[chosen]) throw new Error('Invalid role.');
  const deck = ['mafia', 'mafia', 'detective', 'doctor', 'civilian', 'civilian', 'civilian', 'civilian'];
  let roles;
  if (chosen === 'random') roles = shuffle(deck, random);
  else { deck.splice(deck.indexOf(chosen), 1); roles = [chosen, ...shuffle(deck, random)]; }
  const s = {
    version: 1, id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()), phase: 'reveal', day: 1,
    players: CAST.map((p, id) => ({ ...p, id, name: id === 0 ? name.trim().slice(0, 20) || 'You' : p.name, role: roles[id], alive: true, memory: '', intel: [], lastProtected: null })),
    log: [], cursor: 0, order: [1, 2, 0, 3, 4, 5, 6, 7], ballots: [], winner: null, notes: '', usage: { calls: 0, tokens: 0, cost: 0 },
  };
  event(s, 'The roles are dealt. Day 1 begins.');
  return s;
}
export function event(s, text) { s.log.push({ type: 'event', day: s.day, phase: s.phase, text }); }
export const alive = s => s.players.filter(p => p.alive);
export const currentSpeaker = s => ['discussion', 'defense'].includes(s.phase) ? s.order[s.cursor] : null;
export function startDiscussion(s) {
  s.phase = 'discussion'; s.cursor = 0;
  // Rotate the first speaker, with the human early in the first day's discussion.
  const ids = alive(s).map(p => p.id);
  const offset = s.day % ids.length;
  const rotated = [...ids.slice(offset), ...ids.slice(0, offset)];
  s.order = s.day === 1 ? [1, 2, 0, 3, 4, 5, 6, 7].filter(id => s.players[id].alive) : rotated;
  event(s, `Day ${s.day} · Discussion`);
}
export function speak(s, id, text) {
  if (currentSpeaker(s) !== id || !s.players[id].alive) throw new Error('It is not this player’s turn.');
  if (!text.trim()) throw new Error('Say something or pass.');
  s.log.push({ type: 'speech', day: s.day, phase: s.phase, id, text: text.trim().slice(0, 1600) });
  s.cursor++;
  if (s.cursor >= s.order.length) {
    s.cursor = 0;
    if (s.phase === 'discussion') { s.phase = 'defense'; event(s, 'Final words. One last chance to make your case.'); }
    else { s.phase = 'vote'; event(s, 'The ballot is open.'); }
  }
}
export function legalTargets(s, id, action) {
  const p = s.players[id];
  if (!p?.alive) return [];
  const people = alive(s);
  if (action === 'vote') return [-1, ...people.filter(x => x.id !== id).map(x => x.id)];
  if (action === 'night') {
    if (p.role === 'mafia') return people.filter(x => x.role !== 'mafia').map(x => x.id);
    if (p.role === 'doctor') return people.filter(x => x.id !== p.lastProtected).map(x => x.id);
    if (p.role === 'detective') return people.filter(x => x.id !== id).map(x => x.id);
  }
  return [];
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
  if (ballots.length !== alive(s).length || new Set(ballots.map(b => b.id)).size !== ballots.length || ballots.some(b => !legalTargets(s, b.id, 'vote').includes(b.target))) throw new Error('Invalid ballots.');
  const counts = new Map();
  for (const b of ballots) counts.set(b.target, (counts.get(b.target) || 0) + 1);
  const top = Math.max(...counts.values());
  const leaders = [...counts].filter(([, n]) => n === top).map(([id]) => id);
  s.ballots = ballots.map(b => ({ id: b.id, target: b.target }));
  s.log.push({ type: 'ballots', day: s.day, phase: s.phase, ballots: [...s.ballots] });
  s.phase = 'verdict';
  if (leaders.length === 1 && leaders[0] !== -1) eliminate(s, leaders[0], 'was voted out');
  else event(s, leaders.length > 1 ? 'The vote is tied. No one is eliminated.' : 'The town abstained. No one is eliminated.');
  checkWinner(s);
}
export function startNight(s) {
  if (s.phase !== 'verdict') throw new Error('Cannot start night yet.');
  s.phase = 'night'; event(s, `Night ${s.day} falls.`);
}
export function resolveNight(s, actions) {
  if (s.phase !== 'night') throw new Error('It is not night.');
  const actors = alive(s).filter(p => p.role !== 'civilian');
  if (actions.length !== actors.length || new Set(actions.map(a => a.id)).size !== actions.length || actions.some(a => !legalTargets(s, a.id, 'night').includes(a.target))) throw new Error('Invalid night actions.');
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
  if (!s.winner && s.day >= 15) { s.winner = 'Draw'; s.phase = 'ended'; event(s, 'Day limit reached. The game is a draw.'); }
}
export function nextDay(s) {
  if (s.phase !== 'dawn') throw new Error('Wait for dawn.');
  s.day++; s.ballots = []; startDiscussion(s);
}
// This is the ONLY projection sent to an AI. Never serialize the game itself into a prompt.
export function agentView(s, id, action) {
  const p = s.players[id];
  if (!p || !p.alive) throw new Error('Only living players can act.');
  return {
    self: { id, name: p.name, role: p.role, personality: p.personality, memory: p.memory, intel: structuredClone(p.intel) },
    allies: p.role === 'mafia' ? s.players.filter(x => x.role === 'mafia' && x.id !== id).map(x => ({ id: x.id, name: x.name, alive: x.alive })) : [],
    day: s.day, phase: s.phase, action,
    players: s.players.map(x => ({ id: x.id, name: x.name, alive: x.alive, ...(x.alive ? {} : { revealedRole: x.role }) })),
    publicLog: structuredClone(s.log),
    legalTargets: legalTargets(s, id, action),
  };
}
