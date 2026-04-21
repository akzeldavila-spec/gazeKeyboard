#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright"]
# ///
"""
Social Gaze Experiment – Browser Bot (Playwright)
==================================================
Opens a real Chromium window and plays through the experiment automatically,
so you can run it alongside your own browser to test sync.

Usage:
    python3 browser_bot.py <session_id> <player_num> [--url URL]

    session_id  : same ID you type into your browser (e.g. "test1")
    player_num  : 1 or 2  (use 2 if you are player 1)
    --url       : game URL (default: http://localhost:8080)

Quick-start:
    # 1. Serve the experiment locally (one-time terminal tab)
    cd /Users/akzeldavila/Documents/Social_Gaze_Experiment
    python3 -m http.server 8080

    # 2. Run the bot as player 2
    python3 browser_bot.py test1 2

    # 3. Open http://localhost:8080 in your own browser and enter the same session ID
"""

import argparse
import asyncio
import sys

# ── Quiz: correct answers in question order (from QuizPhase.QUESTIONS) ───────
# Q1 coord same→same=6, Q2 coord same→diff=0, Q3 anti diff→diff=5,
# Q4 anti diff→same=0, Q5 comp diff slices=6, Q6 comp same you-first=6, Q7 comp same partner-first=0
QUIZ_ANSWERS = [6, 0, 6, 0, 6, 6, 0]

# Phase durations (seconds) — must match CONFIG in experiment.js
BASELINE = 1.0
SAMPLE   = 1.0
DELAY    = 1.0
DECISION = 2.0
FEEDBACK = 2.0
DEMO_DURATION = BASELINE + SAMPLE + DELAY + DECISION + FEEDBACK  # 7 s


async def run_bot(url: str, session_id: str, player_num: int):
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("Playwright not installed. Run:  pip install playwright && playwright install chromium")
        sys.exit(1)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False, slow_mo=30)
        page    = await browser.new_page()

        # ── Handle prompt() dialogs (session ID + player number) ──────────────
        async def on_dialog(dialog):
            msg = dialog.message
            log(f"Prompt: {msg!r}")
            if "Session ID" in msg:
                await dialog.accept(session_id)
            elif "Enter ID" in msg or "player" in msg.lower():
                await dialog.accept(str(player_num))
            else:
                await dialog.accept("")
        page.on("dialog", on_dialog)

        log(f"Opening {url}")
        await page.goto(url)
        await page.wait_for_selector("canvas", timeout=15_000)
        await asyncio.sleep(1.5)   # let images start loading
        log("Canvas ready")

        # ── Instruction Phase ─────────────────────────────────────────────────
        # 3 intro pages  →  3 demo intros + 7 s auto-play each  →  done page
        log("Instructions: pressing through 3 intro pages…")
        for i in range(3):
            await asyncio.sleep(1.5)
            await page.keyboard.press("Space")
            log(f"  Intro page {i+1}/3 ✓")

        for d in range(3):
            await asyncio.sleep(1.5)
            await page.keyboard.press("Space")
            log(f"  Demo {d+1}/3 started, waiting {DEMO_DURATION:.0f}s…")
            await asyncio.sleep(DEMO_DURATION + 0.5)

        await asyncio.sleep(1.5)
        await page.keyboard.press("Space")
        log("Instructions done ✓")

        # ── Quiz Phase ────────────────────────────────────────────────────────
        log("Quiz: answering comprehension questions…")
        for qi, answer in enumerate(QUIZ_ANSWERS):
            await page.wait_for_selector("#quiz-input-wrap input", timeout=10_000)
            await asyncio.sleep(0.4)
            await page.fill("#quiz-input-wrap input", str(answer))
            await page.keyboard.press("Enter")
            log(f"  Q{qi+1}: answered {answer} ✓")
            await asyncio.sleep(1.5)   # "Correct!" shows for 1 s then auto-advances
        log("Quiz done ✓")

        # Prompts for session ID + player number fire here automatically.
        # Give them a moment to appear and be dismissed.
        await asyncio.sleep(2.0)
        log(f"Session '{session_id}' joined as Player {player_num}")

        # ── Wait for the experiment instructions phase then press SPACE ──────────
        # The instructions phase starts after Firebase confirms both players have
        # loaded images.  We poll from Python so Playwright sends a real trusted
        # key-press rather than a synthetic JS event (which can be missed).
        log("Waiting for experiment instructions phase…")
        for _ in range(300):   # up to ~30 s
            phase     = await page.evaluate("typeof currentPhase !== 'undefined' ? currentPhase : 'init'")
            wall_time = await page.evaluate("typeof experimentWallStartTime !== 'undefined' ? experimentWallStartTime : null")
            if phase == "instructions" and wall_time is not None:
                break
            await asyncio.sleep(0.1)
        else:
            log("WARNING: instructions phase never detected — pressing Space anyway")

        await asyncio.sleep(0.3)   # let handleKeyPress attach
        await page.keyboard.press("Space")
        log("Pressed SPACE for experiment sync ✓")

        # ── Inject the experiment auto-player ─────────────────────────────────
        # Handles: a random arrow key every decision phase + SPACE on lottery.
        # (The instructions-phase SPACE is handled above by Python.)
        await page.evaluate("""
            () => {
                window._bot = {
                    lastTrialPressed: -1,
                    done: false,
                };

                const KEY = {
                    up: 'ArrowUp', down: 'ArrowDown',
                    left: 'ArrowLeft', right: 'ArrowRight',
                };

                function dispatch(key) {
                    document.dispatchEvent(
                        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
                    );
                }

                function botTick() {
                    if (window._bot.done) return;

                    try {
                        // Decision: pick a random valid arrow key (or G for catch trials) once per trial
                        if (currentPhase === 'decision' && !decisionMade) {
                            const n = trialManager.getCurrentTrialNumber();
                            if (n !== window._bot.lastTrialPressed) {
                                window._bot.lastTrialPressed = n;
                                const trial = trialManager.getCurrentTrial();
                                if (trial.isCatchTrial) {
                                    dispatch('g');
                                    console.log('[BOT] Trial', n, '→ g (catch)');
                                } else {
                                    const choices = [trial.choice1Position, trial.choice2Position];
                                    const choice  = choices[Math.floor(Math.random() * 2)];
                                    dispatch(KEY[choice]);
                                    console.log('[BOT] Trial', n, '→', choice);
                                }
                            }
                        }

                        // Lottery: press SPACE to finish
                        if (currentPhase === 'lottery') {
                            dispatch(' ');
                        }

                        if (currentPhase === 'complete') {
                            window._bot.done = true;
                            console.log('[BOT] Experiment complete!');
                            return;
                        }
                    } catch (e) { /* ignore — variables not yet defined */ }

                    setTimeout(botTick, 150);
                }

                botTick();
                console.log('[BOT] Auto-player injected and running');
            }
        """)
        log("Auto-player injected — bot is now playing")

        # ── Monitor progress ──────────────────────────────────────────────────
        log("Monitoring progress (Ctrl+C to stop early)…")
        prev_trial = 0
        try:
            while True:
                phase = await page.evaluate(
                    "typeof currentPhase !== 'undefined' ? currentPhase : 'init'"
                )
                trial = await page.evaluate(
                    "typeof trialManager !== 'undefined' ? trialManager.getCurrentTrialNumber() : 0"
                )

                if trial != prev_trial and trial > 0:
                    total = await page.evaluate(
                        "typeof trialManager !== 'undefined' ? trialManager.getTotalTrials() : 300"
                    )
                    log(f"Trial {trial}/{total}  [phase={phase}]")
                    prev_trial = trial

                if phase == "complete":
                    log("Experiment complete!")
                    break

                await asyncio.sleep(1.0)

        except KeyboardInterrupt:
            log("Stopped by user")

        log("Keeping browser open for 15 s so you can view results…")
        await asyncio.sleep(15)
        await browser.close()


def log(msg: str):
    from datetime import datetime
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] [BOT] {msg}", flush=True)


def main():
    parser = argparse.ArgumentParser(
        description="Browser bot for Social Gaze Experiment"
    )
    parser.add_argument("session_id", help="Session ID (same as in your browser)")
    parser.add_argument("player_num", type=int, choices=[1, 2],
                        help="Which player the bot plays (1 or 2)")
    parser.add_argument("--url", default="http://localhost:8080",
                        help="Game URL (default: http://localhost:8080)")
    args = parser.parse_args()

    asyncio.run(run_bot(args.url, args.session_id, args.player_num))


if __name__ == "__main__":
    main()
