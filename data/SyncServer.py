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
                    'client_time': data.get('client_time')
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
                        {'started': set(), 'fixated': set(), 'advance_at_ms': None}
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
                        {'started': set(), 'fixated': set(), 'advance_at_ms': None}
                    )
                    state['fixated'].add(player_num)
                    if state['fixated'] == {1, 2} and state['advance_at_ms'] is None:
                        # Give both browsers time to receive the message, then use their
                        # existing clock-offset estimate to advance at the same instant.
                        state['advance_at_ms'] = time.time() * 1000 + 100

                    await broadcast({
                        'type': 'baseline_fixation_status',
                        'session_id': session_id,
                        'trial': trial,
                        'player1_fixated': 1 in state['fixated'],
                        'player2_fixated': 2 in state['fixated'],
                        'advance_at_ms': state['advance_at_ms']
                    })
                except (KeyError, TypeError, ValueError) as error:
                    await websocket.send(json.dumps({
                        'type': 'baseline_fixation_error',
                        'error': str(error)
                    }))

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
