# Mafia protocol 2.0

Frozen for this release. Change `PROTOCOL` in `src/protocol.js` when an observation, rule or action changes. The engine is the reference; this document describes its decisions. Public UI remains a human plus seven independent agents. Evaluation replaces all eight seats with automated players.

## Setup and information

- Eight players: two Mafia, one Detective, one Doctor, four Civilians. Start with day 1. The human may choose a role; evaluation uses random roles.
- A stored unsigned 32-bit seed drives the role deal, persona placement, daily speaker order and nomination tie draws. The LCG is reproducible, not cryptographic. The seed and other hidden state never enter agent observations.
- Each API call receives only `agentView`: own role, own short notebook, own results, public claims and votes, legitimate Mafia allies and messages explicitly addressed to that player. Completed calls, other notebooks and engine command history are excluded.
- Characters and personalities are shuffled across nonhuman seats. Daily speaking order is shuffled. Evaluation disables personalities; the human product keeps them.
- Claims can be lies, including fabricated investigation claims. Only engine events determine facts. A statement cannot change a role, result, vote or action.
- All speech, nomination reasons and Mafia whispers have a 55-word cap; notebooks have a 120-word cap. The engine/adapter cuts excess words. Human input shows a counter and blocks overlong submissions. Words are whitespace-separated tokens, not model tokens.

## Day

1. Every living player speaks once in the seeded order. Later speakers see earlier statements.
2. Living players nominate another living player with a public reason or pass. All use the same pre-nomination observation. Choices and reasons are published together.
3. The most-nominated player becomes the single candidate. Ties use a seeded draw among tied candidates. If everyone passes, nobody is executed and night follows.
4. Only the candidate speaks in the defense phase. No new public speeches are accepted after that defense and before the ballot.
5. Every living player votes simultaneously to execute the candidate or spare them. The candidate cannot vote to execute themselves. Execution requires **more than half of all living players**, including the candidate in the denominator. Equal division spares. At most one execution per day.
6. Roles reveal on death; dead players no longer speak, vote or act. Town wins when no Mafia remain. Mafia wins when they equal or outnumber the Town.

This protocol guarantees the execution candidate a final response to the recorded nominations. It does not guarantee a response to every claim made during open discussion. The optional `plurality` evaluation variant retains one final round for everyone and a simultaneous plurality ballot; it has the known late-accusation limitation and is not the default UI.

## Night

- With two living Mafia, they each speak twice in a private council, in a seeded order. Each message is visible only to the living Mafia at its creation. Own notebooks are never shared. Town UI does not reveal speaker identity. With one Mafia, the council is skipped.
- Afterwards each Mafia independently chooses a non-Mafia victim using the same frozen observation. Agreement selects that victim; disagreement uses the living Mafia list sorted by seat, leader index `(day - 1) % livingMafiaCount`. This tie-break is disclosed to players.
- Doctor protects a living player (self allowed) except the previous night's protected player.
- Detective investigates another living player and receives true Mafia/Town alignment.
- Actions resolve simultaneously. A player killed tonight still completes their action. Protection prevents the kill. The public learns only deaths or that everyone survived. Each actor receives their authorized private result.
- Day 15 ends in a draw if no faction has won.

## Model and failures

Only `openai/gpt-6.1-sol`, `reasoning.effort = medium`, maximum 4096 output tokens, strict structured output, no provider fallback. No automatic switch of model or reasoning effort after a failure. Refused, incomplete, illegal or truncated replies pause play. Retry is explicit. Successful responses from an interrupted simultaneous batch are recoverable from the ledger, including after reload, and are applied only with a complete batch.

Before sending a paid request, fetch model pricing and reserve a conservative estimate: UTF-8 message bytes plus 1024 input tokens of envelope allowance, full output allowance, and any listed per-request fee. Stop before dispatch when the next reservation exceeds the game/cohort guard or attempt cap. Known billed usage replaces its reservation; missing usage keeps the reservation. This is an application spending guard based on catalog pricing, not a guarantee about provider billing. A hard account limit belongs at the provider.

## Records and replay

- Setup, seed, options and protocol; ordered engine commands; every accepted notebook update; private message audience; complete night actions.
- For each attempt: start and finish entries, exact credential-free request, prompt version/fingerprint, response ID/model/provider when supplied, visible response text, usage, duration, outcome and clipping/truncation status. Provider hidden reasoning is not saved.
- IndexedDB stores the current game and completed archives. Live UI exposes no other living role. After game over, replay reconstructs engine state from setup and commands and lets the viewer choose a perspective. Export includes all private game data and visible replies; human personal notes and API keys are excluded.
- Legacy version-1 localStorage saves are left untouched but cannot resume under changed rules. No migration silently reinterprets old games as protocol 2.0.
- This is a local single-player game. Developer tools can inspect the full state; exports are not tamper-proof, server-certified evidence. A seed reproduces game mechanics, not nondeterministic provider output.

## Reference

Design informed by [Dwarkesh Patel's Clocktower protocol](https://github.com/dwarkeshsp/clocktower/blob/main/docs/PROTOCOL.md), reviewed 2026-11-06 (file SHA `1f706f130895985ab7ab25597580aa6e63701bff`). We independently implement Mafia rules; we do not import its Blood on the Clocktower engine or claim comparable ratings. Its protocol uses different roles, communication and high-effort model settings.
