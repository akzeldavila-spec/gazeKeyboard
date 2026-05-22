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

data_queue = asyncio.Queue()

async def handler(websocket):
    print("Client connected")

    try:
        async for message in websocket:
            print("Received:", message)
            await data_queue.put(message)

    except websockets.ConnectionClosed: 
        pass


async def connect(ip: str = '127.0.0.1', port: int = 50020):
    # Change IP if remote connection
    # Commented out right now to test socket handling

    pupil_remote.connect(f'tcp://{ip}:{port}')
    time = pupil_remote.send_string('t')
    pupil_time = pupil_remote.recv_string()
    print(pupil_time)

    #Check with pupilcore to see what Port we should be communicating on

    pupil_remote.send_string('PUB_PORT')
    ipc_pub_port = pupil_remote.recv_string()
    print(f"IPC Publish Port found at: {ipc_pub_port}")
    pub_socket = zmq.Socket(ctx, zmq.PUB)
    pub_socket.connect(f'tcp://{ip}:{ipc_pub_port}')
    time.sleep(0.5)

#function to recieve JSON and put it into pupil core annotations
async def logic():
    while True:
        print("lol")

async def main():

    asyncio.create_task(logic())

    async with websockets.serve(handler, "localhost", 8765):
        print("Server running on ws://localhost:8765")
        await asyncio.Future()
    
    await connect()


asyncio.run(main())


# if __name__ == "__main__":
#     main()
