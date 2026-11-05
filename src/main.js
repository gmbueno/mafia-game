import './style.css';
import { CAST, ROLES, createGame, currentSpeaker, startDiscussion, speak, alive, legalTargets, resolveVotes, startNight, resolveNight, nextDay, agentView } from './game.js';
import { requestTurn } from './ai.js';
import { portrait, icon, emblem } from './art.js';

const $ = sel => document.querySelector(sel);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let game = null;
try { const saved = JSON.parse(localStorage.getItem('mafia-game')); if (saved?.version === 1 && saved.players?.length === 8 && saved.log && saved.phase) game = saved; } catch { /* storage is optional */ }
let apiKey = ''; try { apiKey = sessionStorage.getItem('mafia-key') || ''; } catch { /* storage is optional */ }
let local = false, busy = false, error = '', tab = 'discussion', modal = null, selected = null, chosen = 'random', playerName = 'You';
let auto = true, sound = false, practice = game?.practice || false, marked = [], thinking = [], controller, timer;
let draft = '', pendingCache = new Map();
const phaseLabel = { reveal: 'Your role', discussion: 'Discussion', defense: 'Final words', vote: 'Voting', verdict: 'The verdict', night: 'Nightfall', dawn: 'Daybreak', ended: 'Game over' };
const save = () => { if (game) { try { localStorage.setItem('mafia-game', JSON.stringify(game)); } catch {} } };
const players = () => game?.players || CAST.map((p, id) => ({ ...p, id, alive: true }));
const isNight = () => game && ['night', 'dawn'].includes(game.phase);
const me = () => game?.players[0];
const canSpeak = () => game && currentSpeaker(game) === 0 && me().alive;
const canSelect = () => game && !busy && me().alive && ['vote', 'night'].includes(game.phase);
const targets = () => canSelect() ? legalTargets(game, 0, game.phase) : [];
const roleKnown = p => game && (p.id === 0 || !p.alive || game.winner || (me().role === 'mafia' && p.role === 'mafia'));
const current = () => game ? currentSpeaker(game) : null;
function chime() {
  if (!sound) return;
  try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const o = ctx.createOscillator(), g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value = 520; g.gain.setValueAtTime(.045, ctx.currentTime); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .3); o.start(); o.stop(ctx.currentTime + .3); o.onended = () => ctx.close(); } catch {}
}
function render() {
  const ps = players(), phase = game?.phase;
  const living = ps.filter(p => p.alive).length;
  document.documentElement.dataset.time = isNight() ? 'night' : 'day';
  $('#app').innerHTML = `
    <header class="header"><a class="wordmark" href="./" aria-label="Mafia home"><span class="brand-symbol">${emblem}</span>mafia<span class="brand-dot">.</span></a>
      <div class="header-middle"><span class="tiny-diamond"></span> THE SOCIAL DEDUCTION CLUB</div>
      <nav aria-label="Main"><button class="text-button" data-action="rules">${icon('help')}<span>How to play</span></button><button class="icon-button" data-action="settings" aria-label="Connection settings">${icon('settings')}</button></nav>
    </header>
    <main>
      <section class="table-section">
        <div class="section-heading"><div><div class="eyebrow">${game ? practice ? 'PRACTICE TABLE' : 'PRIVATE TABLE' : 'A GAME OF HIDDEN IDENTITIES'}</div><h1>${game ? game.winner ? 'The cards are on the table.' : isNight() ? 'The city sleeps.' : 'Read the room.' : 'Take a seat.'}</h1></div>
        <div class="table-meta"><span class="status-dot"></span>${living} at the table${game ? `<span class="meta-divider"></span><button class="quiet-icon" data-action="auto" title="${auto ? 'Pause' : 'Resume'} automatic turns" aria-label="${auto ? 'Pause' : 'Resume'} automatic turns">${icon(auto ? 'pause' : 'play')}</button>` : ''}</div></div>
        ${practice && game ? '<div class="practice-banner">Practice mode <span>Offline opponents · No API calls</span></div>' : ''}
        <div class="table-scene ${game ? '' : 'lobby-scene'}" aria-label="Eight-player Mafia table">
          <div class="table-shadow"></div><div class="table-rim"><div class="table-felt"><div class="felt-line"></div><div class="table-center">
          <span class="table-star">${emblem}</span><div class="table-inscription">MAFIA</div><div class="table-subline">TRUST YOUR INSTINCTS</div>
          ${game ? `<div class="phase-chip">${icon(isNight() ? 'moon' : 'sun')} ${isNight() ? 'NIGHT' : 'DAY'} ${String(game.day).padStart(2, '0')}</div><div class="table-phase">${phaseLabel[phase]}</div>${busy ? '<div class="thinking-dots"><i></i><i></i><i></i></div>' : ''}` : '<div class="table-ready"><span></span> ALL SEATS READY</div>'}
          </div><div class="felt-corner left">EST.<br>1986</div><div class="felt-corner right">8<br>PLAYERS</div></div></div>
          ${ps.map(p => renderSeat(p)).join('')}
        </div>
        <div class="below-table">${game ? renderAction() : `<div class="table-caption"><span>${icon('people')} You + 7 AI players</span><span>${icon('lock')} Secret roles</span><span>${icon('sun')} Day & night</span></div>`}</div>
        <div class="bottom-bar"><div class="team-legend"><span><i class="town-dot"></i>${game ? ps.filter(p => p.alive && p.role !== 'mafia').length : 6} Town</span><span><i class="mafia-dot"></i>${game ? ps.filter(p => p.alive && p.role === 'mafia').length : 2} Mafia</span></div><div class="bottom-right"><span>${game ? `DAY ${String(game.day).padStart(2, '0')}` : 'CLASSIC · 8 PLAYERS'}</span><button class="quiet-icon" aria-label="${sound ? 'Mute' : 'Enable'} sounds" data-action="sound">${icon(sound ? 'volume' : 'mute')}</button>${game ? '<button class="text-button small" data-action="new">Leave table</button>' : ''}</div></div>
      </section>
      <aside class="side-panel">${game ? renderGamePanel() : renderLobby()}</aside>
    </main>
    <footer><span>A familiar game. A different kind of company.</span><span>${game && !practice ? '<i class="connection-dot"></i> GPT-6.1 Sol <b>·</b> Medium reasoning' : 'ONE HUMAN. SEVEN POKER FACES.'}</span></footer>
    ${modal !== null ? renderModal() : ''}`;
  bind();
  const messages = $('.messages'); if (messages) messages.scrollTop = messages.scrollHeight;
}
function renderSeat(p) {
  const active = current() === p.id, eligible = targets().includes(p.id), dead = !p.alive;
  const known = roleKnown(p), role = known ? ROLES[p.role] : null;
  const badge = dead ? 'Out' : active ? busy ? 'Thinking' : p.id === 0 ? 'Your turn' : 'Speaking' : p.id === 0 ? 'You' : '';
  return `<button class="seat seat-${p.id} ${active ? 'active' : ''} ${dead ? 'eliminated' : ''} ${selected === p.id ? 'selected' : ''} ${eligible ? 'eligible' : ''}" data-seat="${p.id}" aria-label="${escape(p.name)}${role ? `, ${role.name}` : ', hidden role'}${active ? ', current speaker' : ''}" ${busy && canSelect() ? 'disabled' : ''}>
    <div class="avatar-wrap">${portrait(p.id)}${active ? `<span class="speech-indicator">${busy ? '<i></i><i></i><i></i>' : '<b></b><b></b><b></b><b></b>'}</span>` : ''}${dead ? `<span class="dead-mark">${icon('x')}</span>` : ''}${marked.includes(p.id) ? `<span class="suspicion-mark">${icon('flag')}</span>` : ''}${selected === p.id ? `<span class="selection-mark">${icon('check')}</span>` : ''}</div>
    <span class="seat-name">${escape(p.name)}${p.id === 0 && game && p.name !== 'You' ? '<small>YOU</small>' : ''}</span>
    <span class="seat-detail ${role?.team === 'Mafia' ? 'red' : ''}">${badge ? `<span class="seat-badge ${active ? 'turn-badge' : ''}">${badge}</span>` : role ? role.name : game ? 'Role hidden' : p.style}</span>
  </button>`;
}
function renderLobby() {
  return `<div class="panel-topline"><span class="eyebrow">YOUR NEXT GAME</span><span class="small-tag">01 — 08</span></div>
    <div class="lobby-intro"><div class="mini-cards"><div>${icon('town')}</div><div>${icon('mask')}</div><div>${icon('search')}</div></div><h2>Everyone has<br>something to hide.</h2><p>Find the Mafia. Or make sure they never find you.</p></div>
    <form id="setup-form"><label class="field-label" for="player-name">YOUR NAME</label><input id="player-name" name="name" maxlength="20" value="${escape(playerName)}" autocomplete="off" placeholder="Your name" required />
    <fieldset><legend class="field-label">YOUR ROLE <span>Only you will know</span></legend><div class="role-options">${['random','civilian','mafia','detective','doctor'].map(r => `<button type="button" class="role-option ${r === chosen ? 'chosen' : ''} ${r === 'random' ? 'random-option' : ''}" data-role="${r}" aria-pressed="${r === chosen}">${icon(r === 'random' ? 'shuffle' : ROLES[r].icon)}<span>${r === 'random' ? 'Surprise me' : ROLES[r].name}</span>${r === chosen ? icon('check', 'role-check') : ''}</button>`).join('')}</div></fieldset>
    <button id="start-btn" class="primary-button start-button" type="submit">Take a seat ${icon('arrow')}</button></form>
    <div class="connection-info"><i class="${local || apiKey ? 'connected' : ''}"></i><button data-action="settings">${local ? 'Local connection ready' : apiKey ? 'OpenRouter connected' : 'Connect OpenRouter to play'}</button></div>
    <button class="practice-link" data-action="practice">Try a practice game ${icon('arrow')}</button>`;
}
function renderAction() {
  const p = game.phase;
  if (error) return `<div class="action-card error-card" role="alert"><div><strong>Let’s try that again.</strong><p>${escape(error)}</p></div><button class="secondary-button" data-action="retry">${icon('refresh')} Retry</button></div>`;
  if (busy) return `<div class="action-card busy-card"><span class="orbit-loader"></span><div><strong>${p === 'vote' ? 'The ballots are being cast.' : p === 'night' ? 'The city is sleeping.' : `${escape(game.players[current()]?.name || 'The table')} is thinking.`}</strong><p>${p === 'vote' ? 'Votes stay hidden until everyone has chosen.' : p === 'night' ? 'Night actions are private.' : 'Their next move is their own.'}</p></div><button class="quiet-icon" data-action="cancel" aria-label="Stop waiting">${icon('x')}</button></div>`;
  if (p === 'reveal') return `<div class="action-card role-reveal"><div class="role-icon ${me().role === 'mafia' ? 'red-role' : ''}">${icon(ROLES[me().role].icon)}</div><div><span class="eyebrow">YOUR SECRET ROLE</span><strong>${ROLES[me().role].name}</strong><p>${ROLES[me().role].text}${me().role === 'mafia' ? ` Your partner: ${escape(game.players.find(x => x.id !== 0 && x.role === 'mafia').name)}.` : ''}</p></div><button class="primary-button" data-action="begin">Let’s play ${icon('arrow')}</button></div>`;
  if (['discussion','defense'].includes(p)) return `<div class="action-card turn-card"><span class="turn-symbol">${icon(canSpeak() ? 'send' : 'people')}</span><div><strong>${canSpeak() ? 'The floor is yours.' : `${escape(game.players[current()]?.name)} has the floor.`}</strong><p>${canSpeak() ? p === 'defense' ? 'Make your defense. The vote is next.' : 'Share a suspicion. Ask a question. Make your case.' : `${game.cursor + 1} of ${game.order.length} · ${p === 'defense' ? 'Final words' : 'Discussion'}`}</p></div>${canSpeak() ? '<button class="text-button" data-action="pass">Pass turn</button>' : `<button class="secondary-button" data-action="continue">${auto ? 'Continue' : 'Next speaker'} ${icon('arrow')}</button>`}</div>`;
  if (p === 'vote') return `<div class="action-card"><span class="turn-symbol">${icon('flag')}</span><div><strong>${me().alive ? 'Who do you suspect?' : 'The town is voting.'}</strong><p>${me().alive ? selected === null ? 'Select a player at the table to vote.' : selected === -1 ? 'You will abstain.' : `Your vote: ${escape(game.players[selected].name)}` : 'You’re out. Follow the rest of the game.'}</p></div>${me().alive ? `<button class="text-button" data-action="abstain">Abstain</button><button class="primary-button" data-action="vote" ${selected === null ? 'disabled' : ''}>Lock vote ${icon('check')}</button>` : '<button class="primary-button" data-action="vote">See votes '+icon('arrow')+'</button>'}</div>`;
  if (p === 'verdict' || p === 'dawn') {
    const last = [...game.log].reverse().find(e => e.type === 'event');
    return `<div class="action-card"><span class="turn-symbol">${icon(p === 'dawn' ? 'sun' : 'eye')}</span><div><strong>${escape(last?.text)}</strong><p>${p === 'dawn' ? 'A new day. A little less trust.' : 'The remaining players go into the night.'}</p></div><button class="primary-button" data-action="${p === 'dawn' ? 'day' : 'night'}">${p === 'dawn' ? 'Start day' : 'Nightfall'} ${icon('arrow')}</button></div>`;
  }
  if (p === 'night') {
    const action = { mafia: 'Choose a victim.', detective: 'Who will you investigate?', doctor: 'Who will you protect?', civilian: 'Close your eyes.' };
    const needs = me().alive && me().role !== 'civilian';
    return `<div class="action-card"><span class="turn-symbol">${icon('moon')}</span><div><strong>${me().alive ? action[me().role] : 'The city sleeps.'}</strong><p>${selected !== null ? `Selected: ${escape(game.players[selected].name)}` : needs ? me().role === 'doctor' ? 'Select a player. No consecutive repeat protections.' : 'Select a player at the table. Your choice is private.' : 'The night will reveal its secrets at dawn.'}</p></div><button class="primary-button" data-action="sleep" ${needs && selected === null ? 'disabled' : ''}>${needs ? 'Confirm' : 'Go to dawn'} ${icon('arrow')}</button></div>`;
  }
  if (p === 'ended') return `<div class="action-card end-card"><span class="turn-symbol">${icon(game.winner === 'Mafia' ? 'mask' : 'town')}</span><div><strong>${game.winner === 'Draw' ? 'A draw.' : `${game.winner} wins.`}</strong><p>${game.winner === 'Draw' ? 'The town could not reach a verdict in 15 days.' : (game.winner === ROLES[me().role].team ? 'You were on the winning side.' : 'The other side had the last word.')} All roles are revealed.</p></div><button class="primary-button" data-action="new">Play again ${icon('refresh')}</button></div>`;
  return '';
}
function renderGamePanel() {
  const p = ROLES[me().role];
  return `<div class="your-role-bar"><span class="role-mini">${icon(p.icon)}</span><div><span class="eyebrow">YOUR ROLE</span><strong>${p.name}</strong></div><span class="team-pill ${p.team === 'Mafia' ? 'evil' : ''}">${p.team}</span>${!me().alive ? '<span class="out-label">OUT</span>' : icon('lock','subtle-lock')}</div>
    <div class="panel-tabs" role="tablist"><button role="tab" aria-selected="${tab === 'discussion'}" data-tab="discussion" class="${tab === 'discussion' ? 'active' : ''}">Discussion <span>${game.log.filter(e => e.type === 'speech').length}</span></button><button role="tab" aria-selected="${tab === 'notebook'}" data-tab="notebook" class="${tab === 'notebook' ? 'active' : ''}">${icon('note')} Notebook${me().intel.length ? '<i class="unread-dot"></i>' : ''}</button></div>
    ${tab === 'discussion' ? `<div class="messages" aria-live="polite" aria-label="Public discussion">${game.log.map(renderMessage).join('')}${busy && current() !== null ? `<div class="typing"><span class="status-dot"></span>${escape(game.players[current()].name)} is thinking<span class="ellipsis">…</span></div>` : ''}</div>
    <form id="speech-form" class="compose ${canSpeak() && !busy ? 'your-turn' : ''}"><div class="compose-label">${canSpeak() ? `${icon('send')} YOUR TURN` : me().alive ? `${icon('lock')} ${isNight() ? 'THE CITY IS ASLEEP' : 'WAITING FOR YOUR TURN'}` : `${icon('eye')} SPECTATING`}</div><textarea id="speech" aria-label="Your message to the table" maxlength="1000" placeholder="${canSpeak() ? 'What’s your read?' : 'Listen. Watch. Remember.'}" ${!canSpeak() || busy ? 'disabled' : ''}>${escape(draft)}</textarea><div class="compose-bottom"><span>${canSpeak() ? 'Enter to send · Shift + Enter for a new line' : 'Only the table’s conversation is shared.'}</span><button type="submit" class="send-button" aria-label="Send message" ${!canSpeak() || busy ? 'disabled' : ''}>${icon('arrow')}</button></div></form>` : `<div class="notebook"><div class="private-label">${icon('lock')} ONLY YOU CAN SEE THIS</div>${me().role === 'mafia' ? `<div class="intel-card"><span class="eyebrow">YOUR PARTNER</span><strong>${escape(game.players.find(p => p.id !== 0 && p.role === 'mafia').name)}</strong></div>` : ''}${me().intel.map(e => `<div class="intel-card"><span class="eyebrow">NIGHT ${e.day}</span><p>${escape(e.text)}</p></div>`).join('')}<label for="notes">Your notes</label><textarea id="notes" placeholder="Names, tells, loose ends…" maxlength="5000">${escape(game.notes)}</textarea><p class="notebook-hint">Click a player to flag a suspicion.</p></div>`}`;
}
function renderMessage(e) {
  if (e.type === 'event') return `<div class="system-message"><span></span><p>${escape(e.text)}</p><span></span></div>`;
  if (e.type === 'ballots') return `<div class="ballot-results">${e.ballots.map(b => `<div><span>${escape(game.players[b.id].name)}</span>${icon('arrow')}<strong>${b.target === -1 ? 'Abstained' : escape(game.players[b.target].name)}</strong></div>`).join('')}</div>`;
  return `<article class="message ${e.id === 0 ? 'human-message' : ''}"><div class="message-avatar">${portrait(e.id)}</div><div><div class="message-heading"><strong>${escape(game.players[e.id].name)}</strong><span>${e.id === 0 ? 'YOU' : ''}</span><small>D${e.day}${e.phase === 'defense' ? ' · FINAL' : ''}</small></div><p>${escape(e.text)}</p></div></article>`;
}
function renderModal() {
  let body;
  if (modal === 'settings') body = `<span class="eyebrow">THE CONNECTION</span><h2>Seven minds.<br>One table.</h2><div class="model-display"><span class="model-emblem">${emblem}</span><div><strong>GPT-6.1 Sol</strong><span>OpenRouter · Medium reasoning</span></div><span class="small-tag">7 ×</span></div>${local ? '<div class="local-ready">'+icon('check')+' Local API connection is ready.</div>' : ''}<form id="key-form"><label class="field-label" for="api-key">OPENROUTER API KEY</label><input id="api-key" type="password" placeholder="sk-or-v1-…" autocomplete="off" spellcheck="false" value="${escape(apiKey)}"/><p class="field-help">Your key stays in this browser tab. Requests go directly to OpenRouter. API usage is billed to your account.</p><button class="primary-button" type="submit">Save connection ${icon('arrow')}</button>${apiKey ? '<button type="button" class="text-button forget-key" data-action="forget">Remove saved key</button>' : ''}</form>${game ? `<div class="usage-summary"><span>${game.usage.calls} calls</span><span>${game.usage.tokens.toLocaleString()} tokens</span><span>$${game.usage.cost.toFixed(3)} reported usage</span></div>` : ''}`;
  else if (modal === 'rules') body = `<span class="eyebrow">THE CLASSIC, AT A GLANCE</span><h2>Keep your friends close.</h2><div class="rules-roles">${Object.entries(ROLES).map(([k,r]) => `<div>${icon(r.icon)}<strong>${k === 'civilian' ? '4' : k === 'mafia' ? '2' : '1'} ${r.name}${['mafia','civilian'].includes(k) ? k === 'mafia' ? '' : 's' : ''}</strong><span>${r.text}</span></div>`).join('')}</div><ol class="rules-steps"><li><strong>Talk.</strong> A discussion round, then a final defense.</li><li><strong>Vote.</strong> Most votes goes out. Ties or abstention win: nobody leaves.</li><li><strong>Sleep.</strong> Mafia choose a victim. Doctor protects. Detective investigates.</li></ol><p class="field-help">Town wins by removing both Mafia. Mafia wins at equal numbers. Roles are revealed on elimination. Doctor can protect themselves, but never the same player on consecutive nights. Split Mafia targets use a rotating leader. Day 1 starts with discussion. A 15-day stalemate is a draw.</p><a class="source-link" href="https://en.wikipedia.org/wiki/Mafia_(party_game)" target="_blank" rel="noreferrer">Based on the classic Mafia rules ↗</a>`;
  else if (modal === 'new') body = `<span class="eyebrow">LEAVE THE TABLE</span><h2>${game.winner ? 'Another round?' : 'Call it a night?'}</h2><p class="field-help">${game.winner ? 'New identities. New suspicions.' : 'This ends your current game. Your connection will stay ready.'}</p><button class="primary-button" data-action="reset">${game.winner ? 'New game' : 'Leave game'} ${icon('arrow')}</button><button class="text-button modal-back" data-action="close">Stay at the table</button>`;
  else if (typeof modal === 'number') {
    const p = game.players[modal], known = roleKnown(p);
    body = `<div class="profile-portrait">${portrait(p.id)}</div><span class="eyebrow">SEAT ${String(p.id + 1).padStart(2, '0')} · ${p.alive ? 'IN PLAY' : 'ELIMINATED'}</span><h2>${escape(p.name)}</h2><p class="profile-style">${p.id === 0 ? 'Trust your instincts.' : p.style}</p><div class="profile-role">${icon(known ? ROLES[p.role].icon : 'lock')} ${known ? ROLES[p.role].name : 'Identity unknown'}</div>${p.id !== 0 && p.alive ? `<button class="secondary-button" data-action="flag" data-id="${p.id}">${icon('flag')}${marked.includes(p.id) ? 'Clear suspicion' : 'Mark as suspicious'}</button>` : ''}`;
  }
  return `<div class="modal-backdrop"><section class="modal ${typeof modal === 'number' ? 'profile-modal' : ''}" role="dialog" aria-modal="true" aria-label="${typeof modal === 'number' ? 'Player details' : modal === 'settings' ? 'Connection settings' : modal === 'rules' ? 'How to play' : 'Leave game'}"><button class="icon-button modal-close" data-action="close" aria-label="Close dialog">${icon('x')}</button>${body}</section></div>`;
}
function bind() {
  document.querySelectorAll('[data-action]').forEach(el => el.addEventListener('click', () => action(el.dataset.action, el)));
  document.querySelectorAll('[data-role]').forEach(el => el.addEventListener('click', () => { playerName = $('#player-name').value; chosen = el.dataset.role; render(); }));
  document.querySelectorAll('[data-tab]').forEach(el => el.addEventListener('click', () => { draft = $('#speech')?.value || draft; tab = el.dataset.tab; render(); }));
  document.querySelectorAll('[data-seat]').forEach(el => el.addEventListener('click', () => {
    if (!game) return;
    const id = +el.dataset.seat;
    if (canSelect() && targets().includes(id)) { selected = id; render(); }
    else if (!busy) { draft = $('#speech')?.value || draft; modal = id; render(); focusModal(); }
  }));
  $('#setup-form')?.addEventListener('submit', e => { e.preventDefault(); playerName = $('#player-name').value; launch(false); });
  $('#speech')?.addEventListener('input', e => { draft = e.target.value; });
  $('#speech-form')?.addEventListener('submit', e => { e.preventDefault(); if (!busy && canSpeak() && draft.trim()) { speak(game, 0, draft); draft = ''; selected = null; save(); render(); schedule(); } });
  $('#speech')?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#speech-form').requestSubmit(); } });
  $('#notes')?.addEventListener('input', e => { game.notes = e.target.value; save(); });
  $('#key-form')?.addEventListener('submit', e => { e.preventDefault(); apiKey = $('#api-key').value.trim(); try { if (apiKey) sessionStorage.setItem('mafia-key', apiKey); else sessionStorage.removeItem('mafia-key'); } catch {} modal = null; render(); });
  $('.modal-backdrop')?.addEventListener('click', e => { if (e.target === e.currentTarget) { modal = null; render(); schedule(); } });
}
function focusModal() { requestAnimationFrame(() => $('.modal-close')?.focus()); }
function launch(demo) {
  if (!demo && !local && !apiKey) { modal = 'settings'; render(); focusModal(); return; }
  controller?.abort(); clearTimeout(timer); pendingCache.clear();
  game = createGame(playerName, chosen); game.practice = practice = demo;
  tab = 'discussion'; selected = null; error = ''; draft = ''; marked = []; save(); render();
}
async function action(a, el) {
  if (a === 'settings' || a === 'rules' || a === 'new') { draft = $('#speech')?.value || draft; modal = a; clearTimeout(timer); render(); focusModal(); return; }
  if (a === 'close') { modal = null; render(); schedule(); return; }
  if (a === 'forget') { apiKey = ''; try { sessionStorage.removeItem('mafia-key'); } catch {} render(); return; }
  if (a === 'sound') { sound = !sound; chime(); render(); return; }
  if (a === 'auto') { auto = !auto; clearTimeout(timer); render(); if (auto) schedule(); return; }
  if (a === 'flag') { const id = +el.dataset.id; marked = marked.includes(id) ? marked.filter(x => x !== id) : [...marked, id]; modal = null; render(); return; }
  if (a === 'practice') { playerName = $('#player-name')?.value || playerName; launch(true); return; }
  if (a === 'cancel') { controller?.abort(); return; }
  if (a === 'reset') { controller?.abort(); clearTimeout(timer); pendingCache.clear(); game = null; busy = false; modal = null; error = ''; draft = ''; try { localStorage.removeItem('mafia-game'); } catch {} render(); return; }
  if (busy || !game) return;
  if (a === 'begin') { startDiscussion(game); save(); render(); schedule(); }
  else if (a === 'continue' || a === 'retry') { error = ''; await step(); }
  else if (a === 'pass' && canSpeak()) { speak(game, 0, 'I’m listening. I’ll hold my read for now.'); draft = ''; save(); render(); schedule(); }
  else if (a === 'abstain') { selected = -1; render(); }
  else if (a === 'vote' && game.phase === 'vote' && (!me().alive || selected !== null)) await step();
  else if (a === 'night') { selected = null; startNight(game); save(); render(); }
  else if (a === 'sleep' && game.phase === 'night') await step();
  else if (a === 'day') { selected = null; nextDay(game); save(); render(); schedule(); }
}
function schedule() {
  clearTimeout(timer);
  if (auto && !busy && !error && modal === null && game && ['discussion','defense'].includes(game.phase) && current() !== 0) timer = setTimeout(step, 1500);
  else if (canSpeak()) chime();
}
function offlineTurn(state, id, kind) {
  const view = agentView(state, id, kind), options = view.legalTargets;
  const other = view.players.filter(p => p.alive && p.id !== id && !view.allies.some(a => a.id === p.id));
  const suspect = other[(state.day + id) % other.length];
  const last = [...view.publicLog].reverse().find(e => e.type === 'speech' && e.id !== id);
  const lines = [
    'I’m listening. Let’s compare what people say with how they vote.',
    `I want to hear more from ${suspect.name}. A confident read needs something behind it.`,
    `${suspect.name}, who would you trust with your vote right now? I want a name before everyone follows the room.`,
    'I don’t trust a consensus this early. Let’s hear everyone out before we settle on someone.',
    `${last ? view.players[last.id].name + ' raises a point' : 'We need a starting point'}, but I want to see who actually follows through on their suspicions.`,
    `My read is ${suspect.name}. I’m open to being wrong, but someone has to put a name on the table.`,
    `I’m watching ${suspect.name}. I’ll compare this round with their next vote.`,
    'A good story is easy. A consistent one is harder. Let’s remember where everyone stood before the vote.',
  ];
  const defenses = [
    'I’m standing by what I said. Don’t confuse being careful with being evasive.',
    `My vote will follow the discussion. ${suspect.name} is still the person I want an answer from.`,
    `I haven’t heard enough to clear ${suspect.name}. If you think I’m wrong, point to something specific.`,
    'If I’m wrong, hold me to it tomorrow. I’m not going to hide behind the majority.',
  ];
  let choices = options;
  if (kind === 'vote' && view.self.role === 'mafia') choices = options.filter(t => t === -1 || !view.allies.some(a => a.id === t));
  return { speech: state.phase === 'defense' ? defenses[id % defenses.length] : lines[id], target: kind === 'speech' ? -1 : choices[(state.day + id) % choices.length], memory: '', usage: {} };
}
function recordTurn(id, turn) {
  game.players[id].memory = turn.memory;
  if (!practice) { game.usage.calls++; game.usage.tokens += turn.usage.total_tokens || 0; game.usage.cost += turn.usage.cost || 0; }
}
async function getTurn(snapshot, id, kind) {
  const cacheKey = `${snapshot.day}:${snapshot.phase}:${snapshot.cursor}:${id}:${kind}`;
  if (pendingCache.has(cacheKey)) return pendingCache.get(cacheKey);
  const turn = practice ? await new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve(offlineTurn(snapshot, id, kind)), 550);
    controller.signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  }) : await requestTurn(snapshot, id, kind, { key: apiKey, local, signal: controller.signal });
  pendingCache.set(cacheKey, turn); return turn;
}
async function step() {
  if (busy || !game || modal !== null) return;
  const phase = game.phase;
  if (['discussion','defense'].includes(phase) && current() === 0) return;
  if (!['discussion','defense','vote','night'].includes(phase)) return;
  if (phase === 'vote' && me().alive && selected === null) return;
  if (phase === 'night' && me().alive && me().role !== 'civilian' && selected === null) return;
  if (!practice && !local && !apiKey) { modal = 'settings'; render(); focusModal(); return; }
  clearTimeout(timer); busy = true; error = ''; controller = new AbortController();
  const gameId = game.id, snapshot = structuredClone(game);
  render();
  try {
    if (phase === 'discussion' || phase === 'defense') {
      const id = currentSpeaker(snapshot), turn = await getTurn(snapshot, id, 'speech');
      if (game?.id !== gameId || controller.signal.aborted) return;
      recordTurn(id, turn); speak(game, id, turn.speech);
    } else {
      const actors = alive(snapshot).filter(p => phase === 'vote' || p.role !== 'civilian');
      thinking = actors.map(p => p.id);
      const results = await Promise.all(actors.map(async p => ({ id: p.id, ...(p.id === 0 ? { target: selected } : await getTurn(snapshot, p.id, phase)) })));
      if (game?.id !== gameId || controller.signal.aborted) return;
      for (const t of results) if (t.id !== 0) recordTurn(t.id, t);
      if (phase === 'vote') resolveVotes(game, results); else resolveNight(game, results);
      selected = null; chime();
    }
    pendingCache.clear(); save();
  } catch (e) {
    // Stop all sibling requests before retrying a simultaneous batch.
    controller.abort();
    if (game?.id === gameId) error = e.name === 'AbortError' ? 'Turn paused. Retry when you’re ready.' : e.name === 'TimeoutError' ? 'The player took too long to respond. Retry this turn.' : e.message;
  } finally {
    busy = false; thinking = []; render(); schedule();
  }
}
// Read-only test projection deliberately excludes other living roles and AI notebooks.
window.render_game_to_text = () => JSON.stringify({
  mode: game ? practice ? 'practice' : 'live' : 'lobby', phase: game?.phase || 'setup', day: game?.day || 1,
  currentSpeaker: current(), busy, error,
  players: players().map(p => ({ id: p.id, name: p.name, alive: p.alive, ...(roleKnown(p) ? { role: p.role } : {}) })),
  self: game ? { role: me().role, alive: me().alive, intel: me().intel } : null,
  selected, legalTargets: targets(), winner: game?.winner,
  log: game?.log.slice(-12) || [], coordinates: 'DOM layout; origin top-left, x right, y down',
});
window.advanceTime = async () => { /* Turn-based: time alone never skips a human decision. */ };
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modal !== null) { modal = null; render(); schedule(); }
  if (e.key.toLowerCase() === 'f' && !['INPUT','TEXTAREA'].includes(e.target.tagName)) {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {}); else document.exitFullscreen?.();
  }
  if (e.key === 'Tab' && modal !== null) {
    const focusable = [...document.querySelectorAll('.modal button, .modal input, .modal a')].filter(el => !el.disabled);
    const first = focusable[0], last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }
});
render();
if (import.meta.env.DEV) fetch('/api/local-status').then(r => r.json()).then(data => { local = data.available; render(); }).catch(() => {});
