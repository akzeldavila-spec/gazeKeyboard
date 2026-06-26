import asyncio
from dataclasses import asdict
import json
import time
import websockets

from Surface import build_static_aois

connected = set()
player_ready = set()  # clients that sent player_ready for the current start sync
baseline_states = {}  # (session_id, trial) -> started/fixated player sets
intertrial_states = {}  # (session_id, trial) -> ready players and shared next-baseline target
trial_schedule_states = {}  # (session_id, trial) -> ready players, timings, authoritative phase schedule
client_phase_states = {}  # session_id -> player_num -> latest browser-reported state
last_desync_report = {}  # session_id -> last report wall time

TRIAL_PHASES = ['baseline', 'sample', 'delay', 'decision', 'feedback']


def _positive_int(value, fallback=None):
    if value is None and fallback is not None:
        return fallback
    value = int(value)
    if value < 0:
        raise ValueError('timing values must be non-negative')
    return value


def _extract_timings(raw):
    if not isinstance(raw, dict):
        raise ValueError('timings must be an object')
    return {
        'preBaselineDelay': _positive_int(raw.get('preBaselineDelay'), 0),
        'baseline': _positive_int(raw.get('baseline')),
        'sample': _positive_int(raw.get('sample')),
        'delay': _positive_int(raw.get('delay')),
        'decision': _positive_int(raw.get('decision')),
        'feedback': _positive_int(raw.get('feedback')),
    }


def _build_trial_schedule(start_ms, timings):
    schedule = {}
    cursor = start_ms + timings['preBaselineDelay']
    for phase in TRIAL_PHASES:
        duration = timings[phase]
        schedule[phase] = {
            'start_ms': cursor,
            'end_ms': cursor + duration,
            'duration_ms': duration,
        }
        cursor += duration
    return schedule


def _check_desync(session_id):
    states = client_phase_states.get(session_id, {})
    if 1 not in states or 2 not in states:
        return

    p1 = states[1]
    p2 = states[2]
    reason = None
    severity = 'ok'
    delta_ms = abs(float(p1.get('phase_elapsed_ms', 0)) - float(p2.get('phase_elapsed_ms', 0)))

    if p1.get('trial') != p2.get('trial'):
        severity = 'desync'
        reason = 'trial_mismatch'
    elif p1.get('phase') != p2.get('phase'):
        severity = 'desync'
        reason = 'phase_mismatch'
    elif delta_ms > 250:
        severity = 'warning'
        reason = 'phase_elapsed_mismatch'

    if reason is None:
        return

    now = time.time()
    if now - last_desync_report.get(session_id, 0) < 1.0:
        return
    last_desync_report[session_id] = now

    print(
        f"SYNC {severity.upper()} session={session_id} reason={reason} "
        f"P1 trial={p1.get('trial')} phase={p1.get('phase')} elapsed={p1.get('phase_elapsed_ms')} "
        f"P2 trial={p2.get('trial')} phase={p2.get('phase')} elapsed={p2.get('phase_elapsed_ms')}"
    )


async def broadcast(message):
    if connected:
        await asyncio.gather(
            *(client.send(json.dumps(message)) for client in list(connected)),
            return_exceptions=True
        )

async def handler(websocket):
    connected.add(websocket)
    print(f"Client connected ({len(connected)} total)")
    try:
        async for message in websocket:
            data = json.loads(message)
            msg_type = data.get('type')

            if msg_type == 'ping':
                # Return server time alongside the client's original timestamp so the
                # browser can compute its clock offset without a second round-trip.
                await websocket.send(json.dumps({
                    'type': 'pong',
                    'server_ms': time.time() * 1000,
                    'client_time': data.get('client_time'),
                    'client_perf': data.get('client_perf')
                }))

            elif msg_type == 'get_baseline_cue_aoi':
                try:
                    screen_width = int(data['screen_width'])
                    screen_height = int(data['screen_height'])
                    if screen_width <= 0 or screen_height <= 0:
                        raise ValueError('screen dimensions must be positive')

                    cue_aoi = build_static_aois(
                        screen_width, screen_height
                    )['baseline_symbol']

                    await websocket.send(json.dumps({
                        'type': 'baseline_cue_aoi',
                        'screen_width': screen_width,
                        'screen_height': screen_height,
                        'coordinate_system': 'surface_normalized_bottom_left',
                        'aoi': asdict(cue_aoi)
                    }))
                except (KeyError, TypeError, ValueError) as error:
                    await websocket.send(json.dumps({
                        'type': 'baseline_cue_aoi_error',
                        'error': str(error)
                    }))

            elif msg_type == 'player_ready':
                # Each player sends this when they press space. Once both have sent it,
                # broadcast sync_ack so both start baseline at the same server-derived time.
                # This replaces the old Firebase-onSnapshot → sync_request flow which had
                # a race condition: Machine B could receive sync_ack before its Firebase
                # callback set pendingSyncCallback, silently dropping the sync.
                player_ready.add(websocket)
                print(f"Player ready ({len(player_ready)}/2)")
                if len(player_ready) >= 2:
                    target_ms = time.time() * 1000 + 1000
                    msg = json.dumps({'type': 'sync_ack', 'target_ms': target_ms})
                    await asyncio.gather(*[c.send(msg) for c in connected], return_exceptions=True)
                    player_ready.clear()
                    print(f"Both players ready — sync broadcast to {len(connected)} client(s). Target +1000 ms.")

            elif msg_type == 'baseline_start':
                try:
                    session_id = str(data['session_id'])
                    trial = int(data['trial'])
                    player_num = int(data['player_num'])
                    if player_num not in (1, 2):
                        raise ValueError('player_num must be 1 or 2')
                    state = baseline_states.setdefault(
                        (session_id, trial),
                        {'started': set(), 'fixated': set()}
                    )
                    state['started'].add(player_num)
                except (KeyError, TypeError, ValueError) as error:
                    await websocket.send(json.dumps({
                        'type': 'baseline_fixation_error',
                        'error': str(error)
                    }))

            elif msg_type == 'baseline_fixated':
                try:
                    session_id = str(data['session_id'])
                    trial = int(data['trial'])
                    player_num = int(data['player_num'])
                    if player_num not in (1, 2):
                        raise ValueError('player_num must be 1 or 2')

                    state = baseline_states.setdefault(
                        (session_id, trial),
                        {'started': set(), 'fixated': set()}
                    )
                    state['fixated'].add(player_num)

                    await broadcast({
                        'type': 'baseline_fixation_status',
                        'session_id': session_id,
                        'trial': trial,
                        'player1_fixated': 1 in state['fixated'],
                        'player2_fixated': 2 in state['fixated']
                    })
                except (KeyError, TypeError, ValueError) as error:
                    await websocket.send(json.dumps({
                        'type': 'baseline_fixation_error',
                        'error': str(error)
                    }))

            elif msg_type == 'trial_ready':
                try:
                    session_id = str(data['session_id'])
                    trial = int(data['trial'])
                    player_num = int(data['player_num'])
                    if player_num not in (1, 2):
                        raise ValueError('player_num must be 1 or 2')
                    timings = _extract_timings(data.get('timings'))

                    state = trial_schedule_states.setdefault(
                        (session_id, trial),
                        {'ready': set(), 'timings': {}, 'schedule': None}
                    )
                    state['ready'].add(player_num)
                    state['timings'][player_num] = timings

                    if state['ready'] == {1, 2} and state['schedule'] is None:
                        # Both browsers already loaded the same serialized trial data.
                        # Use the slower/longer provided timings defensively if payloads
                        # ever differ; this prevents one client from being scheduled early.
                        merged_timings = {
                            key: max(state['timings'][1][key], state['timings'][2][key])
                            for key in state['timings'][1]
                        }
                        start_ms = time.time() * 1000 + 250
                        state['schedule'] = _build_trial_schedule(start_ms, merged_timings)

                    await broadcast({
                        'type': 'trial_schedule',
                        'session_id': session_id,
                        'trial': trial,
                        'player1_ready': 1 in state['ready'],
                        'player2_ready': 2 in state['ready'],
                        'schedule': state['schedule']
                    })
                except (KeyError, TypeError, ValueError) as error:
                    await websocket.send(json.dumps({
                        'type': 'trial_schedule_error',
                        'error': str(error)
                    }))

            elif msg_type == 'client_phase_state':
                try:
                    session_id = str(data['session_id'])
                    player_num = int(data['player_num'])
                    if player_num not in (1, 2):
                        raise ValueError('player_num must be 1 or 2')
                    state = {
                        'player_num': player_num,
                        'trial': int(data['trial']),
                        'phase': str(data['phase']),
                        'phase_elapsed_ms': float(data.get('phase_elapsed_ms', 0)),
                        'estimated_server_ms': float(data.get('estimated_server_ms', 0)),
                        'reported_at_server_ms': time.time() * 1000,
                    }
                    client_phase_states.setdefault(session_id, {})[player_num] = state
                    _check_desync(session_id)
                except (KeyError, TypeError, ValueError) as error:
                    print(f"SYNC MONITOR ERROR: {error}")

            elif msg_type == 'intertrial_ready':
                try:
                    session_id = str(data['session_id'])
                    trial = int(data['trial'])
                    player_num = int(data['player_num'])
                    delay_ms = max(0, int(data.get('delay_ms', 1000)))
                    if player_num not in (1, 2):
                        raise ValueError('player_num must be 1 or 2')

                    state = intertrial_states.setdefault(
                        (session_id, trial),
                        {'ready': set(), 'ready_at_ms': {}, 'delay_ms': {}, 'target_ms': None}
                    )
                    now_ms = time.time() * 1000
                    state['ready'].add(player_num)
                    state['ready_at_ms'][player_num] = now_ms
                    state['delay_ms'][player_num] = delay_ms

                    if state['ready'] == {1, 2} and state['target_ms'] is None:
                        # Anchor the next baseline to the blank-screen interval.
                        # Each player waits at least its configured blank duration,
                        # then both are released together at one server timestamp.
                        state['target_ms'] = max(
                            state['ready_at_ms'][p] + state['delay_ms'][p]
                            for p in (1, 2)
                        )

                    await broadcast({
                        'type': 'intertrial_sync',
                        'session_id': session_id,
                        'trial': trial,
                        'player1_ready': 1 in state['ready'],
                        'player2_ready': 2 in state['ready'],
                        'target_ms': state['target_ms']
                    })
                except (KeyError, TypeError, ValueError) as error:
                    await websocket.send(json.dumps({
                        'type': 'intertrial_sync_error',
                        'error': str(error)
                    }))

            elif msg_type == 'sync_request':
                # Per-trial resync: Player 1 sends this at the start of each
                # postFeedbackDelay. Both machines have pendingSyncCallback set by then.
                delay_ms = data.get('delay_ms', 1000)
                try:
                    delay_ms = max(0, int(delay_ms))
                except (TypeError, ValueError):
                    delay_ms = 1000

                target_ms = time.time() * 1000 + delay_ms
                msg = json.dumps({'type': 'sync_ack', 'target_ms': target_ms})
                if connected:
                    await asyncio.gather(*[c.send(msg) for c in connected], return_exceptions=True)
                print(f"Sync broadcast to {len(connected)} client(s). Target +{delay_ms} ms.")

    except websockets.ConnectionClosed:
        pass
    finally:
        connected.discard(websocket)
        player_ready.discard(websocket)
        print(f"Client disconnected ({len(connected)} remaining)")


async def main():
    async with websockets.serve(handler, '0.0.0.0', 8766):
        import socket
        local_ip = socket.gethostbyname(socket.gethostname())
        print(f"Sync server running on ws://0.0.0.0:8766")
        print(f"Connect both browsers to: ws://{local_ip}:8766")
        await asyncio.Future()


if __name__ == '__main__':
    asyncio.run(main())
