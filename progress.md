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
