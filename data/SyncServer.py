import asyncio
import json
import time
import websockets

connected = set()
player_ready = set()  # clients that sent player_ready for the current start sync

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

            elif msg_type == 'sync_request':
                # Per-trial resync: Player 1 sends this at the start of each
                # postFeedbackDelay. Both machines have pendingSyncCallback set by then.
                target_ms = time.time() * 1000 + 1000
                msg = json.dumps({'type': 'sync_ack', 'target_ms': target_ms})
                if connected:
                    await asyncio.gather(*[c.send(msg) for c in connected], return_exceptions=True)
                print(f"Sync broadcast to {len(connected)} client(s). Target +1000 ms.")

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
