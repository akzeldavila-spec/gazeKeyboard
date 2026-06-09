import numpy as np
import msgpack

PATH  = '/Users/akzeldavila/recordings/2026_05_27/001/annotation_timestamps.npy'
PATH2 = '/Users/akzeldavila/recordings/2026_05_27/001/annotation.pldata'

#Use a pickle.load to load in PATH2
timestamps = np.load(PATH)
print(f"Loaded {len(timestamps)} annotation timestamps.")


# .pldata stores each record as (topic, raw_msgpack_bytes).
# A second unpackb on the payload is required to get the annotation dict.
annotations = []
with open(PATH, 'rb') as f:
    unpacker = msgpack.Unpacker(f, raw=False)
    for item in unpacker:
        topic = item[0]
        payload_bytes = item[1]
        datum = msgpack.unpackb(payload_bytes, raw=False)
        annotations.append(datum)

print(f"Found {len(annotations)} annotations.")
for ann in annotations:
    print(ann)
