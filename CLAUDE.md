# Social Gaze Experiment — Agent Guide

## What this is
A two-player, real-time psychology experiment running in the browser. Both players connect via Firebase Firestore and must see identical screens at the same time throughout the experiment — no discernible difference between the two computers at any point.

## How it works
Two players open index.html in separate browsers, enter the same session ID, and are assigned Player 1 or Player 2. Player 1 generates the trial sequence and uploads it to Firebase; Player 2 downloads it. Both then proceed through the experiment together.

### Trial structure (per trial)
`baseline (1s) → sample (1s) → delay (1s) → decision (2s) → feedback (2s) → postFeedbackDelay (1s)`

### Decision rules (determined by the symbol shown)
- **Symbol 1 — Anticoordination**: earn points only if you pick a *different* option from your partner
- **Symbol 2 — Coordination**: earn points only if you pick the *same* option as your partner
- **Symbol 3 — Competition**: whoever responds faster wins the points

### Phase structure
- Phase 1: 120 trials (training charts: delta0_S8, delta05_S8, delta0_S16, delta05_S16)
- Catch trial 1 (press 'g' to continue)
- Phase 2: 120 trials (testing charts: delta025_S8, delta025_S16, delta075_S16, delta05_S32)
- Catch trial 2 (press 'l' to continue)
- Phase 3: 60 trials (replication: delta0_S16, delta05_S8)
- Lottery screen (one random trial selected for payment)

## Sync — the most critical requirement
**Both players must see the same phase at the same time with no discernible difference.** This is the hardest part and the main ongoing engineering concern.

### How sync works
1. At startup, Firebase writes an `experimentStartTime` server timestamp. Each client computes `clientServerTimeDiff = serverTime - localTime` to translate between clocks.
2. When both players press space on the instructions screen, Player 1 writes a `trialSyncTime` server timestamp to Firebase.
3. Both players receive this timestamp via `waitForTrialSyncAndStart()`, compute `syncedPhaseStartTime = serverSyncMs - clientServerTimeDiff + 700ms`, and schedule a setTimeout to set `bothPlayersPressedSpace = true` at that computed local time.
4. When `startPhase('baseline')` fires, it uses `syncedPhaseStartTime` instead of `Date.now()` — both devices share an identical `phaseStartTime` anchor derived from the same server timestamp.
5. All subsequent phases use **fixed-increment timing**: `phaseStartTime += configuredDuration` (never `Date.now()`). This prevents per-frame jitter from accumulating.

### Known drift issue (history)
Before the sync fixes, after ~90–120 trials the two computers drifted by about one trial. The root cause was each client calling `phaseStartTime = Date.now()` independently at the instructions→baseline transition. The fix: both clients derive `phaseStartTime` from the same Firebase server timestamp (`trialSyncTime`).

### If sync breaks
- Check that `trialSyncTime` is being reset to `null` in `waitForBothPlayersImagesLoaded` (prevents stale data from a previous run causing immediate false-start)
- Check that `clientServerTimeDiff` is being computed correctly in `startExperiment`
- Check that `syncedPhaseStartTime` is being set in `waitForTrialSyncAndStart` and consumed in `startPhase`

## Key files
- `experiment.js` — main game loop, phase logic, Firebase sync, timing
- `TrialManager.js` — trial generation, serialization, phase boundaries
- `ImageLoader.js` — preloads chart and symbol images
- `InstructionPhase.js` — demo before the real experiment
- `QuizPhase.js` — comprehension quiz after instructions
- `index.html` — loads Firebase SDK and all scripts
- `styles.css` — canvas styling
- `stimuli/` — all chart and symbol PNG images

## Config (experiment.js top)
```
sampleDuration:          1000ms
delayDuration:           1000ms
decisionDuration:        2000ms
feedbackDuration:        2000ms
postFeedbackDelayDuration: 1000ms
baselineDuration:        1000ms
startingTrialIndex:      0  (set > 0 to skip ahead for testing)
```

## Data output
At end of experiment (or press '7'), a CSV is downloaded per player containing per-trial columns: trial, phase, elapsed_ms, server_elapsed_ms, reaction_time_ms, server_timestamp, condition, delta, scale, chartId, choice, your_points, partner_points. Use `server_elapsed_ms` to compare decisions across the two players' CSVs.

## GOAL
Your goal and this is the top priority is the fix the syncing issues. There are times where the experiment begins and it doesn't even start out synced. There is also an issue with past code where it starts synced but then they begin to drift apart and become unsynced.
