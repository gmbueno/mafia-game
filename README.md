# Mafia

An eight-player Mafia table: one human, seven independent AI players, private roles and memories, public accusations, a final defense and a private Mafia council.

[Play Mafia](https://gmbueno.github.io/mafia-game/) · [Protocol](docs/PROTOCOL.md) · [Evaluation](docs/EVALUATION.md)

## Play

Choose a name and a random or specific role, connect OpenRouter in **Connection settings**, then take a seat. **Practice** uses offline scripted opponents and makes no paid requests.

**Only GPT-6.1 Sol, medium reasoning.** Live games never substitute another model or scripted opponent. Failed calls pause play; successful replies from a partial batch survive retry and reload. Connection settings show all attempts, reported usage and reserved cost, with a per-game spending guard (default $3, 200 attempts). Pricing is checked before paid requests. Unreported costs remain reserved; provider billing may differ from estimates.

The game auto-saves on this device. Completed games stay under **Past games**. After the game, **Replay** lets you move through events from the public table or an individual player's perspective. **Export full game** includes private roles, notebooks and visible AI replies; it excludes API keys and personal human notes. Exports should be shared only after play.

## Rules

- Two Mafia, one Detective, one Doctor, four Civilians. Start with day 1. Each living player has one discussion turn.
- Simultaneous nominations include a reason. The most-nominated player defends, then the town votes to execute or spare. Execution requires more than half of all living players. Tied nominations use a seeded draw; no nominations means no execution. No public speeches occur between the candidate's defense and the ballot.
- At night, living Mafia have two private conversation rounds and then choose targets. Disagreement uses the disclosed rotating leader. Doctor protects a living player (self allowed, no consecutive repeats). Detective learns a player's true faction. Actions resolve simultaneously.
- Roles reveal on death. Dead players cannot act. Town wins with no Mafia; Mafia wins at parity. Draw after day 15.
- Bluffing about roles and investigation results is legal. Engine events remain authoritative. Speech is capped at 55 words; private AI notebooks at 120 words.

See the [complete frozen protocol](docs/PROTOCOL.md) for transitions, information boundaries and experimental variants.

## Local development

Node.js 22 or later:

```sh
npm ci
cp .env.example .env.local
# Add OPENROUTER_API_KEY only to .env.local, if desired.
npm run dev
```

The development-only proxy uses the local key. The production build never contains it. Without a local key, use Connection settings. `npm run preview` serves the static production build and has no credential proxy.

```sh
npm test
npm run build
npm run dev -- --port 5174
# In a second terminal:
npm run test:browser
npm run benchmark -- --games 100
```

Browser tests use isolated headless Chromium with fully mocked provider transport, never your personal browser or paid API. Install Chromium with `npx playwright install chromium` if necessary. Set `TEST_URL` to test a different address. Tests cover a full game, private council, nominations/defense, replay/export, archives, save/resume, errors/retry and mobile layout.

The benchmark command is **offline by default**. Live pilots require an explicit environment key and explicit cost/call/game limits, and remain locked to Sol medium. See [evaluation instructions](docs/EVALUATION.md). CI never runs paid evaluations.

## Hosting and privacy

GitHub Actions tests and builds on `main`, then deploys `dist/` to GitHub Pages. Vite uses relative asset paths. Pages is static: visitors use their own OpenRouter keys, held in their tab's `sessionStorage`. Never embed a shared key in source, a `VITE_` variable or a build artifact. Owner-funded shared access would require a separate authenticated server.

`agentView()` is the sole source of player context. It excludes other notebooks, hidden roles, audit records and human notes. Mafia receive legitimate allies and only messages addressed to them. Simultaneous decisions use frozen observations. Short strategic notebooks are not hidden chain of thought; provider reasoning fields are not stored.

IndexedDB holds the current game and completed archives. API keys are separate. Legacy v1 saves remain in localStorage untouched but cannot resume under v2 rules. As a local single-player game, a human can inspect saved secrets with developer tools. Logs are useful for reproducibility, not tamper-proof multiplayer certification. Clearing site data deletes local games.

## References

Classic [Mafia](https://en.wikipedia.org/wiki/Mafia_(party_game)). Protocol and evaluation design informed by [Dwarkesh Patel's Clocktower project](https://github.com/dwarkeshsp/clocktower), with independently implemented Mafia rules. We do not claim comparable benchmark scores or adopt its high-effort model configuration.
