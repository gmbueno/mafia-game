import './style.css';
import { CAST, ROLES, createGame, currentSpeaker, startDiscussion, speak, alive, legalTargets, resolveVotes, startNight, resolveNight, nextDay, agentView, whisper, resolveNominations, remember, replayAt, playerView, exportGame } from './game.js';
import { requestTurn, recordCall } from './ai.js';
import { portrait, icon, emblem } from './art.js';
import { LIMITS, wordCount } from './protocol.js';
import { loadGame, saveGame, clearGame, listGames } from './storage.js';

const $ = sel => document.querySelector(sel);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let game = null, loading = true;
let apiKey = ''; try { apiKey = sessionStorage.getItem('mafia-key') || ''; } catch { /* storage is optional */ }
let local = false, busy = false, error = '', tab = 'discussion', modal = null, selected = null, chosen = 'random', playerName = 'You';
let auto = true, sound = false, practice = game?.practice || false, marked = [], thinking = [], controller, timer;
let draft = '', pendingCache = new Map(), replayIndex = 0, replaySeat = -1, archives = [];
let spendingLimit = 3, storageIssue = '', replaySnapshot = null;
const isPrivateTurn = () => game?.phase === 'council';
const councilVisible = () => me()?.alive && me()?.role === 'mafia';
const sendSpeech = text => isPrivateTurn() ? whisper(game, 0, text) : speak(game, 0, text);
const phaseLabel = { reveal: 'Your role', discussion: 'Discussion', defense: 'Defense', nomination: 'Nominations', council: 'Private council', vote: 'Voting', verdict: 'The verdict', night: 'Nightfall', dawn: 'Daybreak', ended: 'Game over' };
const save = () => { if (game) saveGame(structuredClone(game)).catch(() => { storageIssue = 'Cannot save this game on this device. Export the record before leaving.'; auto = false; render(); }); };
const players = () => replaySnapshot?.players || game?.players || CAST.map((p, id) => ({ ...p, id, alive: true }));
const isNight = () => game && ['council', 'night', 'dawn'].includes((replaySnapshot || game).phase);
const me = () => game?.players[0];
const canSpeak = () => game && currentSpeaker(game) === 0 && me().alive;
const canSelect = () => game && tab !== 'replay' && !busy && me().alive && ['nomination', 'vote', 'night'].includes(game.phase);
const targets = () => canSelect() ? legalTargets(game, 0, game.phase) : [];
const roleKnown = p => replaySnapshot ? (!p.alive || p.id === replaySeat || (replaySeat >= 0 && replaySnapshot.players[replaySeat].role === 'mafia' && p.role === 'mafia')) : game && (p.id === 0 || !p.alive || game.winner || (me().role === 'mafia' && p.role === 'mafia'));
const current = () => replaySnapshot ? (['discussion','defense'].includes(replaySnapshot.phase) ? currentSpeaker(replaySnapshot) : null) : game && (!isPrivateTurn() || councilVisible()) ? currentSpeaker(game) : null;
function chime() {
  if (!sound) return;
  try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const o = ctx.createOscillator(), g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value = 520; g.gain.setValueAtTime(.045, ctx.currentTime); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .3); o.start(); o.stop(ctx.currentTime + .3); o.onended = () => ctx.close(); } catch {}
}
function render() {
  if (loading) { $('#app').innerHTML = '<div class="loading-table" role="status">Opening the table…</div>'; return; }
  replaySnapshot = tab === 'replay' && game?.winner ? replayAt(game, replayIndex) : null;
  const display = replaySnapshot || game, ps = players(), phase = display?.phase;
  const living = ps.filter(p => p.alive).length;
  document.documentElement.dataset.time = isNight() ? 'night' : 'day';
  $('#app').innerHTML = `
    <header class="header"><a class="wordmark" href="./" aria-label="Mafia home"><span class="brand-symbol">${emblem}</span>mafia<span class="brand-dot">.</span></a>
      <div class="header-middle"><span class="tiny-diamond"></span> THE SOCIAL DEDUCTION CLUB</div>
      <nav aria-label="Main"><button class="text-button" data-action="rules">${icon('help')}<span>How to play</span></button><button class="icon-button" data-action="settings" aria-label="Connection settings">${icon('settings')}</button></nav>
    </header>
    <main>
      <section class="table-section">
        <div class="section-heading"><div><div class="eyebrow">${replaySnapshot ? 'GAME REPLAY' : game ? practice ? 'PRACTICE TABLE' : 'PRIVATE TABLE' : 'A GAME OF HIDDEN IDENTITIES'}</div><h1>${replaySnapshot ? `Day ${display.day}. ${phaseLabel[phase]}.` : game ? game.winner ? 'The cards are on the table.' : isNight() ? 'The city sleeps.' : 'Read the room.' : 'Take a seat.'}</h1></div>
        <div class="table-meta"><span class="status-dot"></span>${living} at the table${game ? `<span class="meta-divider"></span><button class="quiet-icon" data-action="auto" title="${auto ? 'Pause' : 'Resume'} automatic turns" aria-label="${auto ? 'Pause' : 'Resume'} automatic turns">${icon(auto ? 'pause' : 'play')}</button>` : ''}</div></div>
        ${storageIssue ? `<div class="practice-banner" role="alert">${escape(storageIssue)}</div>` : ''}${practice && game ? '<div class="practice-banner">Practice mode <span>Offline opponents · No API calls</span></div>' : ''}
        <div class="table-scene ${game ? '' : 'lobby-scene'}" aria-label="Eight-player Mafia table">
          <div class="table-shadow"></div><div class="table-rim"><div class="table-felt"><div class="felt-line"></div><div class="table-center">
          <span class="table-star">${emblem}</span><div class="table-inscription">MAFIA</div><div class="table-subline">TRUST YOUR INSTINCTS</div>
          ${game ? `<div class="phase-chip">${icon(isNight() ? 'moon' : 'sun')} ${isNight() ? 'NIGHT' : 'DAY'} ${String(display.day).padStart(2, '0')}</div><div class="table-phase">${phaseLabel[phase]}</div>${busy ? '<div class="thinking-dots"><i></i><i></i><i></i></div>' : ''}` : '<div class="table-ready"><span></span> ALL SEATS READY</div>'}
          </div><div class="felt-corner left">EST.<br>1986</div><div class="felt-corner right">8<br>PLAYERS</div></div></div>
          ${ps.map(p => renderSeat(p)).join('')}
        </div>
        <div class="below-table">${game ? renderAction() : `<div class="table-caption"><span>${icon('people')} You + 7 AI players</span><span>${icon('lock')} Secret roles</span><span>${icon('sun')} Day & night</span></div>`}</div>
        <div class="bottom-bar"><div class="team-legend"><span><i class="town-dot"></i>${game ? ps.filter(p => p.alive && p.role !== 'mafia').length : 6} Town</span><span><i class="mafia-dot"></i>${game ? ps.filter(p => p.alive && p.role === 'mafia').length : 2} Mafia</span></div><div class="bottom-right"><span>${game ? `DAY ${String(display.day).padStart(2, '0')}` : 'CLASSIC · 8 PLAYERS'}</span><button class="quiet-icon" aria-label="${sound ? 'Mute' : 'Enable'} sounds" data-action="sound">${icon(sound ? 'volume' : 'mute')}</button>${game ? '<button class="text-button small" data-action="new">Leave table</button>' : ''}</div></div>
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
    <button class="practice-link" data-action="practice">Try a practice game ${icon('arrow')}</button><button class="archive-link text-button" data-action="archives">Past games</button>`;
}
function renderAction() {
  const p = game.phase;
  if (replaySnapshot) return `<div class="action-card"><div><strong>${replaySeat < 0 ? 'The public table.' : `${escape(game.players[replaySeat].name)}’s perspective.`}</strong><p>Only identities known at this point are shown.</p></div><button class="secondary-button" data-action="replay-back">Back to result ${icon('arrow')}</button></div>`;
  if (error) return `<div class="action-card error-card" role="alert"><div><strong>Let’s try that again.</strong><p>${escape(error)}</p></div><button class="secondary-button" data-action="retry">${icon('refresh')} Retry</button></div>`;
  if (busy) return `<div class="action-card busy-card"><span class="orbit-loader"></span><div><strong>${p === 'vote' ? 'The ballots are being cast.' : ['council','night'].includes(p) ? 'The city is sleeping.' : `${escape(game.players[current()]?.name || 'The table')} is thinking.`}</strong><p>${p === 'vote' ? 'Votes stay hidden until everyone has chosen.' : ['council','night'].includes(p) ? 'Night actions are private.' : 'Their next move is their own.'}</p></div><button class="quiet-icon" data-action="cancel" aria-label="Stop waiting">${icon('x')}</button></div>`;
  if (p === 'reveal') return `<div class="action-card role-reveal"><div class="role-icon ${me().role === 'mafia' ? 'red-role' : ''}">${icon(ROLES[me().role].icon)}</div><div><span class="eyebrow">YOUR SECRET ROLE</span><strong>${ROLES[me().role].name}</strong><p>${ROLES[me().role].text}${me().role === 'mafia' ? ` Your partner: ${escape(game.players.find(x => x.id !== 0 && x.role === 'mafia').name)}.` : ''}</p></div><button class="primary-button" data-action="begin">Let’s play ${icon('arrow')}</button></div>`;
  if (p === 'council' && !councilVisible()) return `<div class="action-card"><div><strong>The city sleeps.</strong><p>Private conversations stay private.</p></div><button class="primary-button" data-action="continue">Continue ${icon('arrow')}</button></div>`;
  if (['discussion','defense','council'].includes(p)) return `<div class="action-card turn-card"><span class="turn-symbol">${icon(canSpeak() ? 'send' : 'people')}</span><div><strong>${canSpeak() ? p === 'council' ? 'Speak to your partner.' : 'The floor is yours.' : `${escape(game.players[current()]?.name)} has the floor.`}</strong><p>${canSpeak() ? p === 'defense' ? 'Make your defense. The vote is next.' : p === 'council' ? 'Only living Mafia can hear you.' : 'Share a suspicion. Ask a question. Make your case.' : `${game.cursor + 1} of ${game.order.length} · ${p === 'defense' ? 'Defense' : p === 'council' ? 'Private council' : 'Discussion'}`}</p></div>${canSpeak() ? '<button class="text-button" data-action="pass">Pass turn</button>' : `<button class="secondary-button" data-action="continue">${auto ? 'Continue' : 'Next speaker'} ${icon('arrow')}</button>`}</div>`;
  if (p === 'nomination' || p === 'vote') {
    const nomination = p === 'nomination';
    const title = nomination ? 'Name a suspect.' : `Execute ${escape(game.players[game.nominee]?.name || 'the suspect')}?`;
    return `<div class="action-card"><div><strong>${me().alive ? title : 'The town is deciding.'}</strong><p>${nomination ? 'Select a player, then give your reason.' : 'More than half of the living players must agree.'}</p></div>${me().alive ? `${!nomination && game.nominee !== 0 ? `<button class="secondary-button" data-action="execute">Execute</button>` : ''}<button class="text-button" data-action="abstain">${nomination ? 'Pass' : 'Spare'}</button><button class="primary-button" data-action="vote" ${selected === null || (nomination && selected !== -1 && !draft.trim()) ? 'disabled' : ''}>${selected === -1 ? nomination ? 'Pass nomination' : 'Vote to spare' : selected !== null ? nomination ? 'Nominate' : 'Vote to execute' : 'Confirm'} ${icon('check')}</button>` : '<button class="primary-button" data-action="vote">Continue '+icon('arrow')+'</button>'}</div>`;
  }
  if (p === 'verdict' || p === 'dawn') {
    const last = [...game.log].reverse().find(e => e.type === 'event');
    return `<div class="action-card"><span class="turn-symbol">${icon(p === 'dawn' ? 'sun' : 'eye')}</span><div><strong>${escape(last?.text)}</strong><p>${p === 'dawn' ? 'A new day. A little less trust.' : 'The remaining players go into the night.'}</p></div><button class="primary-button" data-action="${p === 'dawn' ? 'day' : 'night'}">${p === 'dawn' ? 'Start day' : 'Nightfall'} ${icon('arrow')}</button></div>`;
  }
  if (p === 'night') {
    const action = { mafia: 'Choose a victim.', detective: 'Who will you investigate?', doctor: 'Who will you protect?', civilian: 'Close your eyes.' };
    const needs = me().alive && me().role !== 'civilian';
    return `<div class="action-card"><span class="turn-symbol">${icon('moon')}</span><div><strong>${me().alive ? action[me().role] : 'The city sleeps.'}</strong><p>${selected !== null ? `Selected: ${escape(game.players[selected].name)}` : needs ? me().role === 'doctor' ? 'Select a player. No consecutive repeat protections.' : 'Select a player at the table. Your choice is private.' : 'The night will reveal its secrets at dawn.'}</p></div><button class="primary-button" data-action="sleep" ${needs && selected === null ? 'disabled' : ''}>${needs ? 'Confirm' : 'Go to dawn'} ${icon('arrow')}</button></div>`;
  }
  if (p === 'ended') return `<div class="action-card end-card"><span class="turn-symbol">${icon(game.winner === 'Mafia' ? 'mask' : 'town')}</span><div><strong>${game.winner === 'Draw' ? 'A draw.' : `${game.winner} wins.`}</strong><p>${game.winner === 'Draw' ? 'The town could not reach a verdict in 15 days.' : (game.winner === ROLES[me().role].team ? 'You were on the winning side.' : 'The other side had the last word.')} All roles are revealed.</p></div><button class="secondary-button" data-action="replay">Replay</button><button class="primary-button" data-action="new">Play again ${icon('refresh')}</button></div>`;
  return '';
}
function renderGamePanel() {
  if (tab === 'replay' && game.winner) return renderReplay();
  const writing = canSpeak() || (game.phase === 'nomination' && me().alive && selected !== null && selected !== -1);
  const privateView = isPrivateTurn() && councilVisible();
  const p = ROLES[me().role];
  return `<div class="your-role-bar"><span class="role-mini">${icon(p.icon)}</span><div><span class="eyebrow">YOUR ROLE</span><strong>${p.name}</strong></div><span class="team-pill ${p.team === 'Mafia' ? 'evil' : ''}">${p.team}</span>${!me().alive ? '<span class="out-label">OUT</span>' : icon('lock','subtle-lock')}</div>
    <div class="panel-tabs" role="tablist"><button role="tab" aria-selected="${tab === 'discussion'}" data-tab="discussion" class="${tab === 'discussion' ? 'active' : ''}">${privateView ? 'Mafia council' : 'Discussion'} <span>${game.log.filter(e => e.type === 'speech').length}</span></button><button role="tab" aria-selected="${tab === 'notebook'}" data-tab="notebook" class="${tab === 'notebook' ? 'active' : ''}">${icon('note')} Notebook${me().intel.length ? '<i class="unread-dot"></i>' : ''}</button></div>
    ${tab === 'discussion' ? `<div class="messages" aria-live="polite" aria-label="${privateView ? 'Mafia council' : 'Public discussion'}">${privateView ? game.council.filter(e => e.audience.includes(0)).map(e => renderMessage({ ...e, type: 'speech', phase: 'council' })).join('') : game.log.map(renderMessage).join('')}${busy && current() !== null && (!isPrivateTurn() || privateView) ? `<div class="typing"><span class="status-dot"></span>${escape(game.players[current()].name)} is thinking<span class="ellipsis">…</span></div>` : ''}</div>
    <form id="speech-form" class="compose ${writing && !busy ? 'your-turn' : ''}"><div class="compose-label">${writing ? `${icon('send')} ${privateView ? 'MAFIA ONLY' : game.phase === 'nomination' ? 'YOUR NOMINATION' : 'YOUR TURN'}` : me().alive ? `${icon('lock')} ${isNight() ? 'THE CITY IS ASLEEP' : 'WAITING FOR YOUR TURN'}` : `${icon('eye')} SPECTATING`}</div><textarea id="speech" aria-label="Your message to the table" maxlength="5000" placeholder="${writing ? game.phase === 'nomination' ? 'Why this player?' : 'What’s your read?' : 'Listen. Watch. Remember.'}" ${!writing || busy ? 'disabled' : ''}>${escape(draft)}</textarea><div class="compose-bottom"><span>${writing ? `<span id="word-count">${wordCount(draft)} / ${LIMITS.speech} words</span>` : privateView ? 'Only living Mafia see these messages.' : 'Only the table’s conversation is shared.'}</span><button type="submit" class="send-button" aria-label="Send message" ${!writing || busy ? 'disabled' : ''}>${icon('arrow')}</button></div></form>` : `<div class="notebook"><div class="private-label">${icon('lock')} ONLY YOU CAN SEE THIS</div>${me().role === 'mafia' ? `<div class="intel-card"><span class="eyebrow">YOUR PARTNER</span><strong>${escape(game.players.find(p => p.id !== 0 && p.role === 'mafia').name)}</strong></div>` : ''}${me().role === 'mafia' ? game.council.filter(e => e.audience.includes(0)).map(e => `<div class="intel-card"><span class="eyebrow">NIGHT ${e.day} · MAFIA COUNCIL</span><p><strong>${escape(game.players[e.id].name)}:</strong> ${escape(e.text)}</p></div>`).join('') : ''}${me().intel.map(e => `<div class="intel-card"><span class="eyebrow">NIGHT ${e.day}</span><p>${escape(e.text)}</p></div>`).join('')}<label for="notes">Your notes</label><textarea id="notes" placeholder="Names, tells, loose ends…" maxlength="5000">${escape(game.notes)}</textarea><p class="notebook-hint">Click a player to flag a suspicion.</p></div>`}`;
}
function renderReplay() {
  const snapshot = replayAt(game, replayIndex), entry = game.history[replayIndex - 1];
  const view = replaySeat < 0 ? null : playerView(snapshot, replaySeat, 'replay');
  const revealed = snapshot.players.map(p => ({ ...p, known: !p.alive || view?.self.id === p.id || view?.allies.some(a => a.id === p.id) }));
  return `<div class="replay-panel"><div class="replay-heading"><span class="eyebrow">AFTER THE GAME</span><button class="text-button" data-action="replay-back">Back</button></div><h2>Every move.<br>One perspective.</h2>
    <label class="field-label" for="replay-seat">PERSPECTIVE</label><select id="replay-seat"><option value="-1" ${replaySeat === -1 ? 'selected' : ''}>Public table</option>${game.players.map(p => `<option value="${p.id}" ${replaySeat === p.id ? 'selected' : ''}>${escape(p.name)}</option>`).join('')}</select>
    <div class="replay-control"><button data-action="replay-prev" aria-label="Previous event" ${replayIndex === 0 ? 'disabled' : ''}>←</button><span>Day ${snapshot.day} · ${phaseLabel[snapshot.phase]}<small>${replayIndex} / ${game.history.length} events</small></span><button data-action="replay-next" aria-label="Next event" ${replayIndex === game.history.length ? 'disabled' : ''}>→</button></div>
    <input id="replay-step" type="range" min="0" max="${game.history.length}" value="${replayIndex}" aria-label="Replay position"/>
    <div class="replay-identities">${revealed.map(p => `<span class="${!p.alive ? 'out' : ''}">${escape(p.name)}<b>${p.known ? ROLES[p.role].name : 'Unknown'}</b></span>`).join('')}</div>
    <div class="replay-events">${view ? `<div class="intel-card"><span class="eyebrow">${escape(view.self.name)}’S NOTEBOOK</span><p>${escape(view.self.memory || 'No notes yet.')}</p></div>${view.self.intel.map(i => `<div class="intel-card"><span class="eyebrow">NIGHT ${i.day} · PRIVATE RESULT</span><p>${escape(i.text)}</p></div>`).join('')}${view.privateMessages.map(m => `<div class="intel-card"><span class="eyebrow">NIGHT ${m.day} · MAFIA COUNCIL</span><p><strong>${escape(snapshot.players[m.id].name)}:</strong> ${escape(m.text)}</p></div>`).join('')}` : ''}${snapshot.log.slice(-8).map(renderMessage).join('')}</div>
    <button class="secondary-button export-button" data-action="export">Export full game ${icon('arrow')}</button><p class="replay-note">Export includes all private roles, notebooks and visible AI replies. Personal notes and API keys are excluded.</p></div>`;
}
function renderMessage(e) {
  if (e.type === 'event') return `<div class="system-message"><span></span><p>${escape(e.text)}</p><span></span></div>`;
  if (e.type === 'nominations') return `<div class="nomination-list">${e.nominations.filter(n => n.target !== -1).map(n => `<article><strong>${escape(game.players[n.id].name)} → ${escape(game.players[n.target].name)}</strong><p>${escape(n.speech)}</p></article>`).join('')}</div>`;
  if (e.type === 'ballots') return `<div class="ballot-results">${e.ballots.map(b => `<div><span>${escape(game.players[b.id].name)}</span>${icon('arrow')}<strong>${b.target === -1 ? 'Spare / pass' : escape(game.players[b.target].name)}</strong></div>`).join('')}</div>`;
  return `<article class="message ${e.id === 0 ? 'human-message' : ''}"><div class="message-avatar">${portrait(e.id)}</div><div><div class="message-heading"><strong>${escape(game.players[e.id].name)}</strong><span>${e.id === 0 ? 'YOU' : ''}</span><small>D${e.day}${e.phase === 'defense' ? ' · DEFENSE' : e.phase === 'council' ? ' · PRIVATE' : ''}</small></div><p>${escape(e.text)}</p></div></article>`;
}
function renderModal() {
  let body;
  if (modal === 'settings') body = `<span class="eyebrow">THE CONNECTION</span><h2>Seven minds.<br>One table.</h2><div class="model-display"><span class="model-emblem">${emblem}</span><div><strong>GPT-6.1 Sol</strong><span>OpenRouter · Medium reasoning</span></div><span class="small-tag">7 ×</span></div>${local ? '<div class="local-ready">'+icon('check')+' Local API connection is ready.</div>' : ''}<form id="key-form"><label class="field-label" for="api-key">OPENROUTER API KEY</label><input id="api-key" type="password" placeholder="sk-or-v1-…" autocomplete="off" spellcheck="false" value="${escape(apiKey)}"/><p class="field-help">Your key stays in this browser tab. Requests go directly to OpenRouter. API usage is billed to your account.</p><label class="field-label" for="budget">SPENDING GUARD · USD PER GAME</label><input id="budget" type="number" min="0.05" max="100" step="0.05" value="${game?.budget?.maxUsd || spendingLimit}" required/><p class="field-help">Reserves estimated cost before each call. Unreported charges stay reserved. Provider billing may differ.</p><button class="primary-button" type="submit">Save connection ${icon('arrow')}</button>${apiKey ? '<button type="button" class="text-button forget-key" data-action="forget">Remove saved key</button>' : ''}</form>${game ? `<div class="usage-summary"><span>${game.usage.calls} attempts</span><span>${game.usage.tokens.toLocaleString()} tokens</span><span>$${game.usage.cost.toFixed(3)} reported · $${(game.usage.reserved || 0).toFixed(3)} reserved</span></div>` : ''}`;
  else if (modal === 'rules') body = `<span class="eyebrow">THE CLASSIC, AT A GLANCE</span><h2>Keep your friends close.</h2><div class="rules-roles">${Object.entries(ROLES).map(([k,r]) => `<div>${icon(r.icon)}<strong>${k === 'civilian' ? '4' : k === 'mafia' ? '2' : '1'} ${r.name}${['mafia','civilian'].includes(k) ? k === 'mafia' ? '' : 's' : ''}</strong><span>${r.text}</span></div>`).join('')}</div><ol class="rules-steps"><li><strong>Talk.</strong> Discuss, nominate a suspect with a reason, then hear their defense.</li><li><strong>Vote.</strong> Execute or spare the nominee. Execution needs more than half of all living players. Tied nominations use a random draw; no nominations means no execution.</li><li><strong>Sleep.</strong> Mafia confer privately for two rounds, then choose a victim. Doctor protects. Detective investigates.</li></ol><p class="field-help">Town wins by removing both Mafia. Mafia wins at equal numbers. Roles are revealed on elimination. Doctor can protect themselves, but never the same player on consecutive nights. Split Mafia targets use a rotating leader. Day 1 starts with discussion. A 15-day stalemate is a draw.</p><a class="source-link" href="https://en.wikipedia.org/wiki/Mafia_(party_game)" target="_blank" rel="noreferrer">Based on the classic Mafia rules ↗</a>`;
  else if (modal === 'archives') body = `<span class="eyebrow">YOUR RECORDS</span><h2>Past games.</h2><div class="archive-list">${archives.length ? archives.map((g,i) => `<button class="secondary-button" data-action="open-archive" data-index="${i}">${g.practice ? 'Practice' : 'Live'} · ${g.winner} · ${g.day} days ${icon('arrow')}</button>`).join('') : '<p>No completed games yet.</p>'}</div>`;
  else if (modal === 'new') body = `<span class="eyebrow">LEAVE THE TABLE</span><h2>${game.winner ? 'Another round?' : 'Call it a night?'}</h2><p class="field-help">${game.winner ? 'New identities. New suspicions.' : 'This ends your current game. Your connection will stay ready.'}</p><button class="primary-button" data-action="reset">${game.winner ? 'New game' : 'Leave game'} ${icon('arrow')}</button><button class="text-button modal-back" data-action="close">Stay at the table</button>`;
  else if (typeof modal === 'number') {
    const p = players()[modal], known = roleKnown(p);
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
  $('#speech')?.addEventListener('input', e => { draft = e.target.value; const count = wordCount(draft); e.target.setCustomValidity(count > LIMITS.speech ? `Keep your message to ${LIMITS.speech} words.` : ''); if ($('#word-count')) $('#word-count').textContent = `${count} / ${LIMITS.speech} words`; const confirm = document.querySelector('[data-action="vote"]'); if (confirm && game.phase === 'nomination' && selected !== -1) confirm.disabled = !draft.trim() || count > LIMITS.speech; });
  $('#speech-form')?.addEventListener('submit', e => { e.preventDefault(); if (wordCount(draft) > LIMITS.speech) return; if (game.phase === 'nomination') { if (selected !== null && draft.trim()) step(); return; } if (!busy && canSpeak() && draft.trim()) { sendSpeech(draft); draft = ''; selected = null; save(); render(); schedule(); } });
  $('#speech')?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#speech-form').requestSubmit(); } });
  $('#notes')?.addEventListener('input', e => { game.notes = e.target.value; save(); });
  $('#key-form')?.addEventListener('submit', e => { e.preventDefault(); spendingLimit = Number($('#budget').value); if (game) { game.budget = { maxUsd: spendingLimit, maxCalls: 200 }; save(); } apiKey = $('#api-key').value.trim(); try { if (apiKey) sessionStorage.setItem('mafia-key', apiKey); else sessionStorage.removeItem('mafia-key'); } catch {} modal = null; render(); });
  $('#replay-step')?.addEventListener('input', e => { replayIndex = +e.target.value; render(); });
  $('#replay-seat')?.addEventListener('change', e => { replaySeat = +e.target.value; render(); });
  $('.modal-backdrop')?.addEventListener('click', e => { if (e.target === e.currentTarget) { modal = null; render(); schedule(); } });
}
function focusModal() { requestAnimationFrame(() => $('.modal-close')?.focus()); }
function launch(demo) {
  if (!demo && !local && !apiKey) { modal = 'settings'; render(); focusModal(); return; }
  controller?.abort(); clearTimeout(timer); pendingCache.clear();
  game = createGame(playerName, chosen); game.practice = practice = demo; game.budget = { maxUsd: spendingLimit, maxCalls: 200 };
  tab = 'discussion'; selected = null; error = ''; draft = ''; marked = []; save(); render();
}
async function action(a, el) {
  if (a === 'archives') { archives = (await listGames()).reverse(); modal = 'archives'; render(); return; }
  if (a === 'open-archive') { game = archives[+el.dataset.index]; practice = game.practice; modal = null; tab = 'replay'; replayIndex = game.history.length; render(); return; }
  if (a === 'replay' && game?.winner) { tab = 'replay'; replayIndex = game.history.length; render(); return; }
  if (a === 'replay-back') { tab = 'discussion'; render(); return; }
  if (a === 'replay-prev' || a === 'replay-next') { replayIndex = Math.max(0, Math.min(game.history.length, replayIndex + (a === 'replay-prev' ? -1 : 1))); render(); return; }
  if (a === 'export' && game?.winner) { const url = URL.createObjectURL(new Blob([JSON.stringify(exportGame(game), null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `mafia-${game.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return; }
  if (a === 'settings' || a === 'rules' || a === 'new') { draft = $('#speech')?.value || draft; modal = a; clearTimeout(timer); render(); focusModal(); return; }
  if (a === 'close') { modal = null; render(); schedule(); return; }
  if (a === 'forget') { apiKey = ''; try { sessionStorage.removeItem('mafia-key'); } catch {} render(); return; }
  if (a === 'sound') { sound = !sound; chime(); render(); return; }
  if (a === 'auto') { auto = !auto; clearTimeout(timer); render(); if (auto) schedule(); return; }
  if (a === 'flag') { const id = +el.dataset.id; marked = marked.includes(id) ? marked.filter(x => x !== id) : [...marked, id]; modal = null; render(); return; }
  if (a === 'practice') { playerName = $('#player-name')?.value || playerName; launch(true); return; }
  if (a === 'cancel') { controller?.abort(); return; }
  if (a === 'reset') { controller?.abort(); clearTimeout(timer); pendingCache.clear(); game = null; busy = false; modal = null; error = ''; draft = ''; await clearGame(); render(); return; }
  if (busy || !game) return;
  if (a === 'begin') { startDiscussion(game); save(); render(); schedule(); }
  else if (a === 'continue' || a === 'retry') { error = ''; await step(); }
  else if (a === 'pass' && canSpeak()) { sendSpeech('I’m listening. I’ll hold my read for now.'); draft = ''; save(); render(); schedule(); }
  else if (a === 'execute') { selected = game.nominee; render(); }
  else if (a === 'abstain') { selected = -1; render(); }
  else if (a === 'vote' && ['nomination','vote'].includes(game.phase) && (!me().alive || selected !== null)) await step();
  else if (a === 'night') { selected = null; startNight(game); tab = 'discussion'; save(); render(); schedule(); }
  else if (a === 'sleep' && game.phase === 'night') await step();
  else if (a === 'day') { selected = null; nextDay(game); save(); render(); schedule(); }
}
function schedule() {
  clearTimeout(timer);
  if (auto && !busy && !error && modal === null && game && ['discussion','defense','council'].includes(game.phase) && current() !== 0) timer = setTimeout(step, 1500);
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
  if (kind === 'nomination') return { speech: `I nominate ${suspect.name}. I want a clearer account of their choices.`, target: suspect.id, memory: 'Compare claims with the next vote.', usage: {} };
  if (kind === 'council') return { speech: `Let’s target ${suspect.name}. Keep our public stories consistent.`, target: -1, memory: 'Coordinate the target.', usage: {} };
  return { speech: state.phase === 'defense' ? defenses[id % defenses.length] : lines[id], target: ['speech','council'].includes(kind) ? -1 : choices[(state.day + id) % choices.length], memory: '', usage: {} };
}
function recordTurn(id, turn) {
  remember(game, id, turn.memory);
}
async function getTurn(snapshot, id, kind) {
  const cacheKey = `${snapshot.id}:${snapshot.day}:${snapshot.phase}:${snapshot.cursor}:${id}:${kind}`;
  if (pendingCache.has(cacheKey)) return pendingCache.get(cacheKey);
  const recovered = snapshot.calls.findLast(e => e.stage === 'finished' && e.actor === id && e.action === kind && e.historyIndex === snapshot.history.length && e.accepted);
  if (!practice && recovered) return recovered.accepted;
  const turn = practice ? await new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve(offlineTurn(snapshot, id, kind)), 550);
    controller.signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  }) : await requestTurn(snapshot, id, kind, { key: apiKey, local, signal: controller.signal, ledger: game.calls, budget: game.budget, onAttempt: entry => { if (game?.id === snapshot.id) { recordCall(game, entry); save(); } } });
  pendingCache.set(cacheKey, turn); return turn;
}
async function step() {
  if (busy || !game || modal !== null) return;
  const phase = game.phase;
  if (['discussion','defense','council'].includes(phase) && currentSpeaker(game) === 0) return;
  if (!['discussion','defense','council','nomination','vote','night'].includes(phase)) return;
  if (['vote','nomination'].includes(phase) && me().alive && selected === null) return;
  if (phase === 'night' && me().alive && me().role !== 'civilian' && selected === null) return;
  if (phase === 'nomination' && me().alive && selected !== -1 && (!draft.trim() || wordCount(draft) > LIMITS.speech)) return;
  if (!practice && !local && !apiKey) { modal = 'settings'; render(); focusModal(); return; }
  clearTimeout(timer); busy = true; error = ''; controller = new AbortController();
  const gameId = game.id, snapshot = structuredClone(game), stepController = controller;
  render();
  try {
    if (['discussion','defense','council'].includes(phase)) {
      const id = currentSpeaker(snapshot), turn = await getTurn(snapshot, id, phase === 'council' ? 'council' : 'speech');
      if (game?.id !== gameId || stepController.signal.aborted) return;
      recordTurn(id, turn); if (phase === 'council') whisper(game, id, turn.speech); else speak(game, id, turn.speech);
    } else {
      const actors = alive(snapshot).filter(p => ['vote','nomination'].includes(phase) || p.role !== 'civilian');
      thinking = actors.map(p => p.id);
      const settled = await Promise.allSettled(actors.map(async p => { try { return { id: p.id, ...(p.id === 0 ? { target: selected, speech: phase === 'nomination' ? draft : '' } : await getTurn(snapshot, p.id, phase)) }; } catch (e) { stepController.abort(); throw e; } }));
      const failure = settled.find(r => r.status === 'rejected');
      if (failure) throw failure.reason;
      const results = settled.map(r => r.value);
      if (game?.id !== gameId || stepController.signal.aborted) return;
      for (const t of results) if (t.id !== 0) recordTurn(t.id, t);
      if (phase === 'nomination') resolveNominations(game, results); else if (phase === 'vote') resolveVotes(game, results); else resolveNight(game, results);
      selected = null; draft = ''; chime();
    }
    pendingCache.clear(); save();
  } catch (e) {
    // Stop all sibling requests before retrying a simultaneous batch.
    stepController.abort();
    if (game?.id === gameId) error = e.name === 'AbortError' ? 'Turn paused. Retry when you’re ready.' : e.name === 'TimeoutError' ? 'The player took too long to respond. Retry this turn.' : e.message;
  } finally {
    if (game?.id === gameId && controller === stepController) { busy = false; thinking = []; render(); schedule(); }
  }
}
// Read-only test projection deliberately excludes other living roles and AI notebooks.
window.render_game_to_text = () => JSON.stringify({
  mode: game ? practice ? 'practice' : 'live' : 'lobby', phase: game?.phase || 'setup', day: game?.day || 1,
  currentSpeaker: current(), busy, error,
  players: players().map(p => ({ id: p.id, name: p.name, alive: p.alive, ...(roleKnown(p) ? { role: p.role } : {}) })),
  self: game ? { role: me().role, alive: me().alive, intel: me().intel } : null,
  nominee: game?.nominee, privateMessages: game?.council.filter(e => e.audience.includes(0)) || [],
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
    const focusable = [...document.querySelectorAll('.modal button, .modal input, .modal select, .modal a')].filter(el => !el.disabled);
    const first = focusable[0], last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }
});
loadGame().then(saved => { if (saved?.version === 2) { game = saved; practice = Boolean(saved.practice); } }).catch(() => { storageIssue = 'Local storage is unavailable.'; }).finally(() => { loading = false; render(); });
render();
if (import.meta.env.DEV) fetch('/api/local-status').then(r => r.json()).then(data => { local = data.available; render(); }).catch(() => {});
