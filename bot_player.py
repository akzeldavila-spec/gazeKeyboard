#!/usr/bin/env python3
"""
Social Gaze Experiment – Automated Bot Player
==============================================
Simulates a second player using the Firebase Firestore REST API so you can
test sync between two windows without needing a real second participant.

Usage:
    python3 bot_player.py <session_id> <player_num> [--trials N]

    session_id  : Same ID entered in the browser (e.g. "test1")
    player_num  : 1 or 2  (use 2 if you are player 1 in the browser)
    --trials N  : Stop after N trials instead of the full 300 (optional)

Examples:
    python3 bot_player.py test1 2           # bot is player 2, full run
    python3 bot_player.py test1 2 --trials 10   # only run 10 trials

Install deps first (one-time):
    pip install requests
"""

import argparse
import random
import sys
import time
from datetime import datetime, timezone

import requests

# ── Firebase config (matches index.html) ─────────────────────────────────────
API_KEY    = "AIzaSyCA3q_kwPAgZxhPx3TLqF6m4odxCw-Osds"
PROJECT_ID = "social-gaze-experiment"
BASE_URL   = (
    f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}"
    "/databases/(default)/documents"
)

# ── Experiment phase durations (seconds, from CONFIG in experiment.js) ────────
BASELINE_DUR      = 1.0
SAMPLE_DUR        = 1.0
DELAY_DUR         = 1.0
DECISION_DUR      = 2.0
FEEDBACK_DUR      = 2.0
POST_FEEDBACK_DUR = 1.0
DECISION_OFFSET   = BASELINE_DUR + SAMPLE_DUR + DELAY_DUR        # 3 s
TRIAL_DURATION    = DECISION_OFFSET + DECISION_DUR + FEEDBACK_DUR + POST_FEEDBACK_DUR  # 8 s

POLL_INTERVAL = 0.5   # seconds between Firestore polls

# ── Chart definitions (mirrors TrialManager.js) ───────────────────────────────
CHARTS = {
    "delta0_S8":    {"largerpoints": 4,  "smallerpoints": 4},
    "delta05_S8":   {"largerpoints": 6,  "smallerpoints": 2},
    "delta025_S8":  {"largerpoints": 5,  "smallerpoints": 3},
    "delta0_S16":   {"largerpoints": 8,  "smallerpoints": 8},
    "delta05_S16":  {"largerpoints": 12, "smallerpoints": 4},
    "delta025_S16": {"largerpoints": 10, "smallerpoints": 6},
    "delta075_S16": {"largerpoints": 14, "smallerpoints": 2},
    "delta05_S32":  {"largerpoints": 24, "smallerpoints": 8},
}


# ── Firestore REST helpers ────────────────────────────────────────────────────

class _TS:
    """Wraps an ISO string so fs_value() emits a Firestore timestampValue."""
    def __init__(self, iso: str):
        self.iso = iso


def fs_url(path: str) -> str:
    return f"{BASE_URL}/{path}?key={API_KEY}"


def fs_get(path: str) -> dict | None:
    r = requests.get(fs_url(path), timeout=10)
    if r.status_code in (404, 400):
        return None
    r.raise_for_status()
    return r.json()


def fs_patch(path: str, fields: dict) -> dict:
    """Write specific fields (create doc if missing, merge if it exists)."""
    url = f"{BASE_URL}/{path}?key={API_KEY}"
    for fp in fields:
        url += f"&updateMask.fieldPaths={fp}"
    body = {"fields": {k: _to_fs(v) for k, v in fields.items()}}
    r = requests.patch(url, json=body, timeout=10)
    r.raise_for_status()
    return r.json()


def fs_post(path: str, fields: dict) -> dict:
    """Create a new auto-ID document in a collection."""
    body = {"fields": {k: _to_fs(v) for k, v in fields.items()}}
    r = requests.post(fs_url(path), json=body, timeout=10)
    r.raise_for_status()
    return r.json()


def _to_fs(v) -> dict:
    """Convert a Python value to a Firestore REST typed value."""
    if isinstance(v, _TS):
        return {"timestampValue": v.iso}
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, float):
        return {"doubleValue": v}
    if isinstance(v, str):
        return {"stringValue": v}
    if isinstance(v, list):
        return {"arrayValue": {"values": [_to_fs(i) for i in v]}}
    if isinstance(v, dict):
        return {"mapValue": {"fields": {k: _to_fs(vv) for k, vv in v.items()}}}
    if v is None:
        return {"nullValue": None}
    raise TypeError(f"Unsupported type for Firestore: {type(v)}")


def _from_fs(raw) -> object:
    """Recursively parse a Firestore REST typed value into a Python value."""
    if "booleanValue" in raw:
        return raw["booleanValue"]
    if "integerValue" in raw:
        return int(raw["integerValue"])
    if "doubleValue" in raw:
        return raw["doubleValue"]
    if "stringValue" in raw:
        return raw["stringValue"]
    if "nullValue" in raw:
        return None
    if "timestampValue" in raw:
        return raw["timestampValue"]
    if "arrayValue" in raw:
        return [_from_fs(i) for i in raw["arrayValue"].get("values", [])]
    if "mapValue" in raw:
        return {k: _from_fs(vv) for k, vv in raw["mapValue"].get("fields", {}).items()}
    return None


def parse_doc(doc: dict) -> dict:
    """Turn a full Firestore REST document response into a plain dict."""
    return {k: _from_fs(v) for k, v in doc.get("fields", {}).items()}


def get_session(session_id: str) -> dict | None:
    doc = fs_get(f"sessions/{session_id}")
    return parse_doc(doc) if doc else None


# ── Trial generation (mirrors TrialManager.generatePhase1Block) ───────────────

def _make_block(chart_ids: list[str], repeats: int) -> list[dict]:
    pos_combos = [["up", "down"], ["left", "right"]]
    symbol_ids  = [1, 2, 3]
    trials: list[dict] = []
    for rep in range(1, repeats + 1):
        rep_trials = []
        for cid in chart_ids:
            for pos in pos_combos:
                for sym in symbol_ids:
                    rep_trials.append({
                        "chartId":         cid,
                        "choice1Position": pos[0],
                        "choice2Position": pos[1],
                        "symbolId":        sym,
                        "repetition":      rep,
                    })
        random.shuffle(rep_trials)
        trials.extend(rep_trials)
    return trials


def generate_trials() -> list[dict]:
    """Generate the same 300-trial sequence as TrialManager.generateTrials()."""
    return (
        _make_block(["delta0_S8",   "delta05_S8",   "delta0_S16",   "delta05_S16"],   5) +
        _make_block(["delta025_S8", "delta025_S16",  "delta075_S16", "delta05_S32"],   5) +
        _make_block(["delta0_S16",  "delta05_S8"],                                     5)
    )


# ── Bot ───────────────────────────────────────────────────────────────────────

class BotPlayer:
    def __init__(self, session_id: str, player_num: int, max_trials: int | None = None):
        self.sid         = session_id
        self.pnum        = player_num
        self.max_trials  = max_trials
        self.trials: list[dict] = []
        self.total_pts   = 0

    # ── logging ──────────────────────────────────────────────────────────────

    def _log(self, msg: str):
        ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        print(f"[{ts}] [P{self.pnum}] {msg}", flush=True)

    # ── Firebase helpers ─────────────────────────────────────────────────────

    def _set(self, **fields):
        fs_patch(f"sessions/{self.sid}", fields)

    def _poll(self, ok_fn, desc: str, timeout: float = 300.0) -> dict:
        """Poll session doc until ok_fn(data) is True. Returns the data."""
        self._log(f"Waiting for: {desc} …")
        deadline = time.time() + timeout
        while time.time() < deadline:
            data = get_session(self.sid)
            if data and ok_fn(data):
                self._log(f"  ✓ {desc}")
                return data
            time.sleep(POLL_INTERVAL)
        raise TimeoutError(f"Timed out waiting for: {desc}")

    # ── main flow ─────────────────────────────────────────────────────────────

    def run(self):
        self._log(f"Bot starting – session='{self.sid}'  player={self.pnum}")

        # 1. Register ─────────────────────────────────────────────────────────
        self._set(**{f"player{self.pnum}_joined": True})
        self._log("Registered in session")

        # 2. Wait for both players joined ─────────────────────────────────────
        self._poll(
            lambda d: d.get("player1_joined") and d.get("player2_joined"),
            "both players joined"
        )

        # 3. Trial sequence ───────────────────────────────────────────────────
        if self.pnum == 1:
            self._log("Generating trial sequence …")
            self.trials = generate_trials()
            serialized  = [
                {k: t[k] for k in
                 ("chartId", "choice1Position", "choice2Position", "symbolId", "repetition")}
                for t in self.trials
            ]
            self._set(trialSequence=serialized, trialsGenerated=True)
            self._log(f"Uploaded {len(self.trials)} trials to Firebase")
        else:
            data = self._poll(
                lambda d: d.get("trialsGenerated") and d.get("trialSequence"),
                "Player 1 to upload trial sequence"
            )
            raw = data["trialSequence"]
            self.trials = [
                {k: t[k] for k in
                 ("chartId", "choice1Position", "choice2Position", "symbolId", "repetition")}
                for t in raw
            ]
            self._log(f"Downloaded {len(self.trials)} trials from Firebase")

        # Limit trials if requested
        if self.max_trials:
            self.trials = self.trials[: self.max_trials]
            self._log(f"Limiting to first {self.max_trials} trials")

        # 4. Signal trials + images loaded ────────────────────────────────────
        self._set(
            **{f"player{self.pnum}_trials_loaded": True,
               f"player{self.pnum}_images_loaded": True}
        )
        self._log("Signalled trials and images loaded")

        # 5. Wait for both images loaded ──────────────────────────────────────
        self._poll(
            lambda d: d.get("player1_images_loaded") and d.get("player2_images_loaded"),
            "both players to finish loading images"
        )

        # 6. Signal SPACE press (ready) ───────────────────────────────────────
        time.sleep(0.3)   # tiny pause so the browser sees the loading screen
        self._set(**{f"player{self.pnum}_ready": True})
        self._log("Sent SPACE / ready signal")

        # 7. Wait for both ready ──────────────────────────────────────────────
        self._poll(
            lambda d: d.get("player1_ready") and d.get("player2_ready"),
            "both players ready"
        )

        # 8. Trial loop ───────────────────────────────────────────────────────
        self._log(f"Starting trial loop ({len(self.trials)} trials, ~{len(self.trials)*TRIAL_DURATION:.0f}s total) …")
        self._log("─" * 60)

        experiment_start = time.time()

        for i, trial in enumerate(self.trials):
            trial_num  = i + 1
            chart_id   = trial["chartId"]
            choice1    = trial["choice1Position"]
            choice2    = trial["choice2Position"]

            # Sleep until the decision phase opens for this trial
            decision_time = experiment_start + i * TRIAL_DURATION + DECISION_OFFSET
            wait = decision_time - time.time()
            if wait > 0:
                time.sleep(wait)
            elif wait < -2.0:
                self._log(f"  ⚠ Trial {trial_num}: {-wait:.1f}s behind schedule")

            # Random choice
            choice = random.choice([choice1, choice2])
            chart  = CHARTS.get(chart_id, {})
            pts    = (chart["largerpoints"]  if choice == choice1
                      else chart["smallerpoints"])
            self.total_pts += pts

            # Build decision document
            now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
            decision = {
                "sessionId":       self.sid,
                "playerNum":       self.pnum,
                "trialNumber":     trial_num,
                "chartId":         chart_id,
                "symbolId":        trial["symbolId"],
                "choice":          choice,
                "choice1Position": choice1,
                "choice2Position": choice2,
                "timestamp":       _TS(now_iso),
            }

            try:
                fs_post(f"sessions/{self.sid}/decisions", decision)
                self._log(
                    f"  Trial {trial_num:3d}/{len(self.trials)} "
                    f"| {chart_id:14s} | sym={trial['symbolId']} "
                    f"| chose {choice:<5s} | +{pts:2d} pts "
                    f"| total={self.total_pts}"
                )
            except Exception as exc:
                self._log(f"  Trial {trial_num}: ERROR – {exc}")

        self._log("─" * 60)
        self._log(f"All {len(self.trials)} trials done!  Total points = {self.total_pts}")
        self._log("Bot finished. Browser should now show the lottery / complete screen.")


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Automated bot player for Social Gaze Experiment"
    )
    parser.add_argument("session_id",  help="Session ID (same as entered in browser)")
    parser.add_argument("player_num",  type=int, choices=[1, 2],
                        help="Which player the bot plays (1 or 2)")
    parser.add_argument("--trials",    type=int, default=None, metavar="N",
                        help="Stop after N trials (default: full 300)")
    args = parser.parse_args()

    bot = BotPlayer(args.session_id, args.player_num, args.trials)
    try:
        bot.run()
    except KeyboardInterrupt:
        print("\nBot stopped.")
    except TimeoutError as exc:
        print(f"\nTimeout: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
