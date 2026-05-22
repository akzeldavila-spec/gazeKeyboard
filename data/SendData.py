import zmq
import msgpack as serializer
import time
import websockets
import asyncio
import sys

#General setup for annotations and remote conenction 
ctx = zmq.Context()
pupil_remote = zmq.Socket(ctx, zmq.REQ)
remote_ip = '10.169.10.237'

async def handler(websocket):
    print("Client connected")

    async for message in websocket:
        print("Received:", message)

# Change IP if remote connection
async def main(ip: str = '127.0.0.1', port: int = 50020):
    # pupil_remote.connect(f'tcp://{ip}:{port}')
    # time = pupil_remote.send_string('t')
    # pupil_time = pupil_remote.recv_string()
    # print(pupil_time)

    async with websockets.serve(handler, "localhost", 8765):
        print("Server running on ws://localhost:8765")
        await asyncio.Future()


asyncio.run(main())


# if __name__ == "__main__":
#     main()
