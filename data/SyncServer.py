import asyncio
import json
import time
import websockets

connected = set()

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

            elif msg_type == 'sync_request':
                # 1000 ms matches postFeedbackDelayDuration so the blank screen
                # lasts its full configured duration before baseline starts.
                target_ms = time.time() * 1000 + 1000
                msg = json.dumps({'type': 'sync_ack', 'target_ms': target_ms})
                if connected:
                    await asyncio.gather(*[c.send(msg) for c in connected], return_exceptions=True)
                print(f"Sync broadcast to {len(connected)} client(s). Target +1000 ms.")

    except websockets.ConnectionClosed:
        pass
    finally:
        connected.discard(websocket)
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
