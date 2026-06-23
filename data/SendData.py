import zmq
import zmq.asyncio
import msgpack as serializer
import websockets
import asyncio
import json
import time

ctx = zmq.asyncio.Context()
pupil_remote = zmq.asyncio.Socket(ctx, zmq.REQ)
remote_ip = '10.169.10.237'

data_queue = asyncio.Queue()
browser_clients = set()

async def handler(websocket):
    browser_clients.add(websocket)
    print("Client connected")
    try:
        async for message in websocket:
            print("Received:", message)
            await data_queue.put(message)
            await websocket.send(json.dumps({'type': 'annotation_ack'}))
    except websockets.ConnectionClosed:
        pass
    finally:
        browser_clients.discard(websocket)

#Function to configure the connection
async def connect(ip: str = '127.0.0.1', port: int = 50020):
    pupil_remote.connect(f'tcp://{ip}:{port}')

    # Record paired (pupil clock, local clock) reference for timestamp offsets
    before = asyncio.get_event_loop().time()
    await pupil_remote.send_string('t')
    pupil_time_ref = float(await pupil_remote.recv_string())
    local_time_ref = (before + asyncio.get_event_loop().time()) / 2
    local_wall_time_ref = time.time()

    #publish socket (sending data)
    await pupil_remote.send_string('PUB_PORT')
    ipc_pub_port = await pupil_remote.recv_string()
    print(f"IPC Publish Port found at: {ipc_pub_port}")

    pub_socket = zmq.asyncio.Socket(ctx, zmq.PUB)
    pub_socket.connect(f'tcp://{ip}:{ipc_pub_port}')

    await asyncio.sleep(0.5)


    #subscribe socket (recieving data)
    await pupil_remote.send_string('SUB_PORT')
    sub_port = await pupil_remote.recv_string()
    print(f"IPC Subscribe Port found at: {sub_port}")

    subscriber = zmq.asyncio.Socket(ctx, zmq.SUB)
    subscriber.connect(f'tcp://{ip}:{sub_port}')
    subscriber.setsockopt_string(zmq.SUBSCRIBE, 'surfaces.MyScreen')



    await asyncio.sleep(0.5)
    print("Setup complete")

    return pub_socket, pupil_time_ref, local_time_ref, local_wall_time_ref, subscriber


async def ann_logic(pub_socket, pupil_time_ref, local_time_ref, local_wall_time_ref):
    print("Annotations Logic working as expected")
    while True:
        try:
            data = json.loads(await data_queue.get())
            print(f"Processing: {data}")

            # Map experiment's 'type' field to PupilLabs annotation fields
            data['label'] = data.get('type', 'event')
            data['topic'] = 'annotation'
            data['duration'] = 0.0
            data['added_in_capture'] = True

            # Prefer the browser-provided wall-clock event time when available.
            # This reduces the timing error from websocket transit and queue delay.
            event_wall_time_ms = data.get('event_wall_time_ms')
            if event_wall_time_ms is not None:
                data['timestamp'] = pupil_time_ref + ((float(event_wall_time_ms) / 1000.0) - local_wall_time_ref)
            else:
                # Fallback for older browser payloads without event_wall_time_ms.
                data['timestamp'] = pupil_time_ref + (asyncio.get_event_loop().time() - local_time_ref)

            payload = serializer.packb(data, use_bin_type=True)
            await pub_socket.send_string('annotation', flags=zmq.SNDMORE)
            await pub_socket.send(payload)
            print(f"Annotation sent: label={data['label']}  t={data['timestamp']:.3f}s")

        except Exception as e:
            print(f"Error, data not sent: {e}")
        finally:
            data_queue.task_done()


async def fixation_logic(subscriber):
    print("Connected to glasses")
    while True:
        try:
            topic = await subscriber.recv_string()
            payload = serializer.unpackb(await subscriber.recv(), raw=False)
            fixations = payload.get('fixations_on_surfaces', [])

            for fixation in fixations:
                if fixation.get('on_surf') is False:
                    continue

                norm_pos = fixation.get('norm_pos')
                if not isinstance(norm_pos, (list, tuple)) or len(norm_pos) < 2:
                    continue

                message = json.dumps({
                    'type': 'fixation',
                    'topic': topic,
                    'x': float(norm_pos[0]),
                    'y': float(norm_pos[1]),
                    'timestamp': fixation.get('timestamp'),
                    'duration': fixation.get('duration'),
                    'confidence': fixation.get('confidence')
                })
                if browser_clients:
                    await asyncio.gather(
                        *(client.send(message) for client in list(browser_clients)),
                        return_exceptions=True
                    )
        except asyncio.CancelledError:
            raise
        except Exception as error:
            print(f"Error receiving fixation data: {error}")


async def main():
    pub_socket, pupil_time_ref, local_time_ref, local_wall_time_ref, subscriber = await connect()
    asyncio.create_task(ann_logic(pub_socket, pupil_time_ref, local_time_ref, local_wall_time_ref))
    asyncio.create_task(fixation_logic(subscriber))
    async with websockets.serve(handler, "localhost", 8765):
        print("Server running on ws://localhost:8765")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
