import zmq
import zmq.asyncio
import msgpack as serializer
import websockets
import asyncio
import json

ctx = zmq.asyncio.Context()
pupil_remote = zmq.asyncio.Socket(ctx, zmq.REQ)
remote_ip = '10.169.10.237'

data_queue = asyncio.Queue()

async def handler(websocket):
    print("Client connected")
    try:
        async for message in websocket:
            print("Received:", message)
            await data_queue.put(message)
            await websocket.send("Data queued successfully")
    except websockets.ConnectionClosed:
        pass

#Function to configure the connection
async def connect(ip: str = '127.0.0.1', port: int = 50020):
    pupil_remote.connect(f'tcp://{ip}:{port}')

    # Record paired (pupil clock, local clock) reference for timestamp offsets
    before = asyncio.get_event_loop().time()
    await pupil_remote.send_string('t')
    pupil_time_ref = float(await pupil_remote.recv_string())
    local_time_ref = (before + asyncio.get_event_loop().time()) / 2

    await pupil_remote.send_string('PUB_PORT')
    ipc_pub_port = await pupil_remote.recv_string()
    print(f"IPC Publish Port found at: {ipc_pub_port}")


    pub_socket = zmq.asyncio.Socket(ctx, zmq.PUB)
    pub_socket.connect(f'tcp://{ip}:{ipc_pub_port}')
    await asyncio.sleep(0.5)
    print("Setup complete")


    return pub_socket, pupil_time_ref, local_time_ref


async def logic(pub_socket, pupil_time_ref, local_time_ref):
    print("Logic working as expected")
    while True:
        try:
            data = json.loads(await data_queue.get())
            print(f"Processing: {data}")

            # Map experiment's 'type' field to PupilLabs annotation fields
            data['label'] = data.get('type', 'event')
            data['topic'] = 'annotation'
            data['duration'] = 0.0
            data['added_in_capture'] = True

            # Translate to Pupil's internal clock: offset from paired reference
            data['timestamp'] = pupil_time_ref + (asyncio.get_event_loop().time() - local_time_ref)

            payload = serializer.packb(data, use_bin_type=True)
            await pub_socket.send_string('annotation', flags=zmq.SNDMORE)
            await pub_socket.send(payload)
            print(f"Annotation sent: label={data['label']}  t={data['timestamp']:.3f}s")

        except Exception as e:
            print(f"Error, data not sent: {e}")
        finally:
            data_queue.task_done()


async def main():
    pub_socket, pupil_time_ref, local_time_ref = await connect()
    asyncio.create_task(logic(pub_socket, pupil_time_ref, local_time_ref))

    async with websockets.serve(handler, "localhost", 8765):
        print("Server running on ws://localhost:8765")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
