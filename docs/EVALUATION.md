# Evaluation plan and spending controls

The playable product and the evaluation environment have different purposes. Human-plus-seven-agent sessions demonstrate interactions; they are not controlled comparisons of model ability. The automated runner uses eight agents, neutral personalities, seeded setup/order, and frozen observations for simultaneous actions.

## Run without spending

```sh
npm run benchmark -- --games 100 --seed 1 --output output/baseline
npm run benchmark -- --games 100 --seed 1 --variant no-council --output output/no-council
npm run benchmark -- --games 100 --seed 1 --variant plurality --output output/plurality
```

Default players sample uniformly from legal actions. They do not reason about dialogue or investigations and may vote against an ally. These runs validate transitions and provide an uninformed mechanical baseline, not GPT performance or proof of balance. `--traces` retains full per-game records; reports always retain per-game outcomes and seeds. Output is ignored by Git.

`standard` uses protocol 2.0. `no-council` changes only council rounds from two to zero. `plurality` changes only the daily nomination/defense/ballot mechanism to the earlier final-speech and plurality sequence. These are protocol comparisons, not model comparisons. The historical v1 source is commit `f9e62e85f5dc0efd332b167073041049aebef2fa`; the current plurality variant includes the corrected prompt and instrumentation and must not be labeled an exact v1 reproduction.

## Optional, deliberately small live pilot

Nothing invokes live evaluation automatically. It is excluded from CI and browser tests. The runner does not load `.env.local` automatically. It requires a key supplied in the environment, `--live`, and all three explicit limits. The model and reasoning setting cannot be overridden.

```sh
# Requires OPENROUTER_API_KEY already set in this process's environment.
npm run benchmark -- --live --games 1 --max-calls 8 --max-usd 0.50 --output output/live-smoke
```

This example will normally stop before a full game: it is a transport/behavior smoke test. Live runs are restricted to at most two games, 200 attempts and $2 of estimated/known usage across the whole run. A failure or exhausted budget leaves an **incomplete** game and a saved record; it never silently substitutes random actions, drops a failed game, or lowers reasoning effort. All calls use GPT-6.1 Sol medium. Costs without reported usage retain their estimates. Resume interactive games through the UI; the CLI currently saves interrupted records but does not resume them.

Optional `--probes` requests detached beliefs from living Town players before nominations. Each probe counts against the same paid attempt/cost limits, is stored separately, and never writes its answer to memory or public dialogue. Brier score is calculated against the engine's roles. No probe calls are made unless both `--live` and `--probes` are present. Provider hidden chain of thought is neither requested nor needed.

## Before interpreting an experiment

1. Freeze the protocol, prompt, model settings, seeds, role assignment policy, speech budget and stopping/exclusion policy. Reports include the Git commit and SHA-256 hashes of relevant source files, so a dirty checkout is distinguishable from that commit.
2. Use seeds 1–100000 for development. Reserve seeds 100001+ for evaluation with `--holdout`; do not inspect these runs while tuning. A flag alone does not prevent human reuse: keep a manifest of consumed seed ranges.
3. Compare one change at a time on the same seed set. The initial role deal is identical across current variants. Different rules consume later random draws differently; do not claim identical full trajectories. For future comparisons between model/prompt policies, assign each policy to both factions on each deal. Same-model random setup alone does not implement such a side-swapped rating experiment.
4. Counterbalance role/seat assignments for any human or focal-agent comparisons, and record persona conditions separately. Chosen-role human games cannot estimate unconditional win rates.
5. Use independent games as the sampling units; for paired comparisons, resample seed pairs. Report faction win rates with intervals, completed and incomplete counts, games hitting limits, days without execution, abstentions, invalid/clipped/truncated turns, latency, and reported/reserved cost. Current CLI provides per-game metrics and Wilson intervals for a single cohort; it does not fit Elo or claim superiority.
6. For consistency analysis, annotate claims against public events and private engine evidence, separately from legal bluffs. A false statement is not automatically a reasoning error. Record annotation criteria and review uncertain cases; no automatic LLM judge is currently used.
7. Use a small live pilot to find protocol failures, then choose sample size for a predeclared effect and uncertainty target. Do not treat a small pilot, a selected entertaining game or random-policy results as a model ranking.

A balanced game need not produce exactly 50/50 faction wins. Changing a rule because it helps one side is a design decision, not evidence that a model improved. Our 100-game offline release check is an engine test; no live cohort was run for this release.

## Reference and limits

[Clocktower's protocol](https://github.com/dwarkeshsp/clocktower/blob/main/docs/PROTOCOL.md) motivates versioned rules, per-seat observations, explicit budgets and detached belief measurements. Its [protocol history](https://github.com/dwarkeshsp/clocktower/blob/main/docs/protocol-history.md) shows why transport failures and information channels need auditing. Its [findings](https://github.com/dwarkeshsp/clocktower/blob/main/docs/findings/README.md) also document limitations. Their game, reasoning budget and model pool differ from ours; their rankings do not transfer to Mafia.

To compare two reports on matching seeds, run `node scripts/compare.mjs output/baseline/report.json output/no-council/report.json`. It reports the paired change in Town win rate, a bootstrap interval resampling whole seed pairs, missing/incomplete counts, and worst-case sensitivity to missing outcomes. It rejects mismatched protocols, modes, splits and model settings. Inspect the setup/conditions yourself before interpreting the estimate; an interval is not evidence that an arbitrary comparison was well designed.
