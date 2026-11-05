# Mafia

A classic eight-player Mafia table: one human, seven independent AI players. Built in English, with a visual table, individual personalities, private roles and notebooks, two rounds of daily discussion, simultaneous voting, and night actions.

## Play

Choose a name and a random or specific role, connect OpenRouter in **Connection settings**, then take a seat. A clearly marked offline practice game is also available.

**AI model:** `openai/gpt-6.1-sol` with `reasoning.effort: medium`. No alternative models or automatic scripted fallback in live games. API failures pause the turn and allow retry. OpenRouter usage is charged to the connected account; reported tokens and cost appear in Connection settings. AI turns advance automatically; use the pause control beside the player count to advance them manually. Human turns always wait for you. An eliminated human can continue as a spectator.

## Run locally

Requires Node.js 22 or later.

```sh
npm ci
cp .env.example .env.local
# Put your OpenRouter key in OPENROUTER_API_KEY inside .env.local.
npm run dev
```

Open the local address printed by Vite. The development-only local proxy uses `.env.local`; the key is never embedded into the browser bundle. Environment files are ignored by Git. Without a local key, enter a personal key in Connection settings.

```sh
npm test
npm run build
npm run preview
```

`npm run preview` serves the production static build; it does not provide the development proxy. Enter a key in Connection settings for live games in that mode.

## GitHub Pages

The included workflow tests and builds the app, then deploys `dist/` to Pages on pushes to `main`. Under **Settings → Pages → Build and deployment**, select **GitHub Actions**. No repository API secret is required. Vite uses relative asset paths so the app works under a repository URL.

GitHub Pages is static hosting. Visitors supply their own OpenRouter key, held in `sessionStorage` for that tab. Keys go directly to OpenRouter and are not saved with games. Do not put a shared API key into the source, a `VITE_` variable, GitHub Pages files, or a workflow build artifact. A shared-key deployment would need a separate authenticated server.

## House rules

Based on [Mafia (party game)](https://en.wikipedia.org/wiki/Mafia_(party_game)), with explicit rules for this eight-player table:

- **2 Mafia, 1 Detective, 1 Doctor, 4 Civilians.** Roles are shuffled, including when the human chooses a role.
- Day 1 begins with a discussion. Each living player gets one opening turn and one final defense. The opening speaker rotates on later days.
- Living players submit simultaneous ballots. No self-votes. Abstention is allowed. A unique plurality eliminates; ties or an abstention plurality eliminate nobody.
- Eliminated players reveal their role and cannot speak, vote or use abilities.
- At night, each living Mafia nominates a non-Mafia victim. If they disagree, a rotating living Mafia leader's nomination wins. Their partner identity is private to the Mafia.
- Doctor protects one living player, including themselves, but cannot repeat the previous night's target.
- Detective investigates one other living player and privately learns **Mafia** or **Town**.
- Night actions resolve simultaneously; a killed special-role player still performs that night's action. A protected victim survives; the public is not told who was protected.
- Town wins when all Mafia are gone. Mafia wins at parity with Town. An unresolved game after 15 days ends in a draw.

## Information boundaries

`agentView()` is the only source of AI game context. Every request has its own system prompt, personality, role, private memory, private investigation/protection history, and public transcript. It never receives the game object, another player's memory, the human's notes, or another living player's role. Mafia receive only their legitimate ally identities. Votes and night actions use a frozen snapshot and are revealed/resolved only after all responses arrive. Successful responses in a failed batch are cached for retry within that page session.

The returned `memory` field is a short strategic notebook, not hidden chain of thought. It is stored separately per player and never shown in public discussion. Player dialogue is treated as untrusted game data in the system prompt; as with any LLM, instruction adherence cannot be mathematically guaranteed.

Games auto-save to `localStorage` on the current browser. This is a single-player browser game: the local engine necessarily holds secret roles and memories. They are hidden from the UI and excluded from other agents' requests, but a human with developer tools can inspect their own saved game. This is not a server-authoritative multiplayer system.

## Validation

```sh
npm test                         # Rules, transitions, victories and AI isolation
node tests/browser-smoke.mjs      # Isolated headless Chromium; start dev server first
```

Set `TEST_URL` if Vite runs on a different port (default test URL is `http://127.0.0.1:5174`). Install the test browser with `npx playwright install chromium` if needed. Browser smoke tests cover a complete practice game, discussion and defense, votes, night actions, private notes, save/resume, mocked live requests and retry, dialogs, and mobile overflow. No test uses the user's personal browser.

Reference: [OpenRouter reasoning configuration](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens).
