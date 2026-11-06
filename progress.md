Original prompt: Build Mafia in English for one human and seven independent GPT-6.1 Sol AIs (medium reasoning), with secret random or chosen roles, a clean visual table, discussion/defense/voting/night phases, isolated memories, OpenRouter integration, a new GitHub repository and GitHub Pages. Do not use the user's browser. API credentials must never be committed or embedded in the published bundle.

Decisions:
- Vanilla JavaScript + Vite; static build supports GitHub Pages.
- Eight-player variant: 2 Mafia, 1 Detective, 1 Doctor, 4 Civilians. Day-first, two speaking rounds, simultaneous private ballots, plurality/tie skips, simultaneous night actions. Roles revealed on death. Mafia win at parity; town wins with no Mafia.
- openai/gpt-6.1-sol verified against OpenRouter model catalog on 2026-11-05. reasoning.effort=medium.
- Local-only development proxy keeps provided key outside browser; deployed static site accepts a visitor's key for their browser session.
- Browser tests use isolated headless Playwright only.

Implemented:
- Custom illustrated portraits and felt-table UI, responsive desktop/mobile, night theme, accessible dialogs and keyboard shortcuts.
- Full rules engine, privacy projection, per-player API notebooks, simultaneous ballots and night resolution, private detective results, Doctor cooldown, Mafia teammates, spectator flow, endgame role reveal.
- Connection settings, local-only proxy, tab-scoped production key, explicit offline practice, usage reporting, auto/manual AI turns, cancellation/retry, save/resume, private human notes and suspicion flags.
- 18 rules/privacy tests pass. First real OpenRouter call returned HTTP 200 from openai/gpt-6.1-sol using requested medium configuration, with valid structured speech and memory.
- Initial browser screenshot inspected; added compact desktop styling so the start control remains visible on shorter windows.

Validation completed:
- All 18 engine/privacy tests pass; production Vite build passes.
- Real OpenRouter checks: structured speech, Mafia night target, Doctor protection, Detective investigation and a day ballot all returned HTTP 200 with legal actions from openai/gpt-6.1-sol.
- Headless browser smoke passed a complete 3-day practice game to Mafia victory, human speech, spectator flow, reveal-all endgame, reload/resume, private notes, suspicion flags, dialogs, mocked API rate-limit + retry, and mobile overflow checks (213 UI actions, zero page errors).
- Inspected desktop discussion/night/private-notebook/endgame and mobile lobby/game screenshots. Fixed repeated page-entry fades and improved night-mode contrast.
- Credential scan of source and production build passed; .env.local is ignored and never staged.
- GitHub repository created: https://github.com/gmbueno/mafia-game
- Production-build browser test also passed with two real AI speeches and a human response over direct OpenRouter requests (no development proxy), seven other identities hidden, zero page errors.
- Pages enabled with GitHub Actions at https://gmbueno.github.io/mafia-game/; automatic test/build/deployment workflow configured on main.

Future improvements (optional): authenticated server for owner-funded/shared-key hosting, voice dialogue, and additional house-rule presets. Current requested single-player game is complete.

2026-11-06 — Protocol 2.0 implementation after Clocktower review:
- User authorized all review improvements, explicitly restricted paid evaluation to GPT-6.1 Sol medium and asked not to run an expensive cohort. No paid calls have been made in this development pass.
- Referenced dwarkeshsp/clocktower docs/PROTOCOL.md and LICENSE using GitHub connector. Independent Mafia implementation; protocol/evaluation references documented.
- New default sequence: seeded discussion order, simultaneous reasoned nominations, chosen nominee's final defense, simultaneous execute/spare ballot requiring a strict majority. Mafia have two private council rounds before simultaneous night actions.
- Fixed bluff instruction conflict, enforce speech/notebook word budgets, preserve per-seat notebooks through command history, seed and version protocol, record exact credential-free requests and visible responses with each attempt and usage/failure status.
- Cost reservations checked before dispatch; failed/missing usage remains accounted for; no lower-effort/model fallback. Accepted partial-batch responses recover from persistent ledger after reload.
- IndexedDB current game and completed archive; after-game perspective replay and JSON audit export. API keys and human notes excluded from export. Legacy v1 save left untouched; new rules do not reinterpret it.
- Offline-by-default evaluation runner with per-game metrics, source hashes, explicit tiny live caps, atomic checkpoints, optional detached belief probes. Added paired-seed comparison and documented development/holdout protocol. Human sessions kept separate from automated comparisons.
- Added 16 tests (34 total), including privacy across phases, majority rules, late-defense guarantee, private council, replay equivalence, billed invalid responses, concurrent budget reservations and detached probes. Tests and build pass.
- Offline 100-game standard plus five games for each alternative completed with zero provider calls. These are uninformed random policies, not model quality/balance estimates.
- Headless full browser tests passed detective and Mafia practice games, council privacy, nominations, defense, archives, replay/export, save/resume, mocked failure/retry, mobile overflow. All provider transport intercepted. Refining historical table rendering in replay and final deployment verification next.
- Final browser pass after historical-table and lifecycle fixes: PASS, two mocked live requests, zero page errors. Verified desktop and mobile replay screenshots; private council remains readable from the Mafia notebook after night discussion.
- Production build and credential scan of source, docs, tests and build passed. No API key in tracked files or artifacts. CI now runs the isolated mocked browser flow before Pages deployment.
