import numpy as np
import msgpack
import csv

# Each of the eye.npy files stores timestamps in a numpy array. Each index is a frame in the video. So the 300th element is the 
# 300th frame of the video. The 0th index is the start of the recording. This is how we know what time certain frames occured 
# in the video. This data is used in conjunction with other data.

ANNPATH  = '/Users/akzeldavila/recordings/2026_05_27/001/annotation_timestamps.npy'
ANNPATH2 = '/Users/akzeldavila/recordings/2026_05_27/001/annotation.pldata'

EYEPATH  = '/Users/akzeldavila/recordings/2026_05_27/001/eye0_timestamps.npy' #right eye
EYEPATH2 = '/Users/akzeldavila/recordings/2026_05_27/001/eye1_timestamps.npy' #left eye

GAZEPATH = '/Users/akzeldavila/recordings/2026_05_27/001/gaze_timestamps.npy'
GAZEPATH2 = '/Users/akzeldavila/recordings/2026_05_27/001/gaze.pldata'

FIXATIONPATH = '/Users/akzeldavila/recordings/2026_05_27/001/fixations_timestamps.pldata'
FIXATIONPATH2 = '/Users/akzeldavila/recordings/2026_05_27/001/fixations.pldata'

def loadEyeTimes():
    right_timestamps = np.load(EYEPATH)
    left_timestamps = np.load(EYEPATH2)

    print(f"Found {len(right_timestamps)} annotations for the right eye.")
    print(f"Found {len(left_timestamps)} annotations for the left eye.")

    return right_timestamps, left_timestamps

# 'base_data' is a list of timestamps (exact times in seconds) showing when the 
# eye-tracker captured each individual look that made up this single fixation.
# Bascially contains the low-level pupil measurements that were used to compute the gaze estimate or fixation.

# What it is used for:
# It acts like a lookup key. You can use these times to find the raw data 
# (like pupil size or eye movement speed) for each frame of this look.

def loadFixations():
    fixations = []
    with open(FIXATIONPATH2, 'rb') as f:
        unpacker = msgpack.Unpacker(f, raw=False)
        for item in unpacker:
            topic = item[0]
            payload_bytes = item[1]
            datum = msgpack.unpackb(payload_bytes, raw=False)
            fixations.append(datum)
    
    print(f"Found {len(fixations)} fixation annotations.")
    print(fixations[0])
    return fixations

def loadGaze():
    gaze = []
    with open(GAZEPATH2, 'rb') as f:
        unpacker = msgpack.Unpacker(f, raw=False)
        for item in unpacker:
            topic = item[0]
            payload_bytes = item[1]
            datum = msgpack.unpackb(payload_bytes, raw=False)
            gaze.append(datum)
    
    print(f"Found {len(gaze)} gaze annotations.")
    return gaze

# .pldata stores each record as (topic, raw_msgpack_bytes).
# A second unpackb on the payload is required to get the annotation dict.
def loadAnnotations():
    annotations = []
    with open(ANNPATH2, 'rb') as f:
        unpacker = msgpack.Unpacker(f, raw=False)
        for item in unpacker:
            topic = item[0]
            payload_bytes = item[1]
            datum = msgpack.unpackb(payload_bytes, raw=False)
            annotations.append(datum)

        print(f"Found {len(annotations)} event annotations.")
        return annotations

def align_data(annotations, fixations, gazes):
    aligned_data = []
    
    for ann in annotations:
        ann_time = ann['timestamp']
        
        # Find the closest fixation and gaze data
        fixation = next((f for f in fixations if f['timestamp'] >= ann_time), None)
        gaze = next((g for g in gazes if g['timestamp'] >= ann_time), None)
        
        if fixation and gaze:
            aligned_data.append({
                'annotation': ann,
                'fixation': fixation,
                'gaze': gaze
            })
    
    return aligned_data

def save_aligned_data_to_csv(aligned_data, filename):
    with open(filename, mode='w', newline='') as file:
        writer = csv.writer(file)
        
        # Write header
        headers = ['annotation_timestamp', 'fixation_timestamp', 'gaze_timestamp']
        for key in aligned_data[0]['annotation'].keys():
            if key != 'base_data':
                headers.append(f'annotation_{key}')
        for key in aligned_data[0]['fixation'].keys():
            headers.append(f'fixation_{key}')
        for key in aligned_data[0]['gaze'].keys():
            headers.append(f'gaze_{key}')
        
        writer.writerow(headers)
        
        # Write data
        for item in aligned_data:
            row = [
                item['annotation']['timestamp'],
                item['fixation']['timestamp'],
                item['gaze']['timestamp']
            ]
            for key, value in item['annotation'].items():
                if key != 'base_data':
                    row.append(value)
            for key, value in item['fixation'].items():
                row.append(value)
            for key, value in item['gaze'].items():
                row.append(value)
            
            writer.writerow(row)

def main():
    gaze = loadGaze()
    fixations = loadFixations()
    ann = loadAnnotations()
    
    aligned_data = align_data(ann, fixations, gazes)
    
    save_aligned_data_to_csv(aligned_data, 'aligned_data.csv')
    
    print("Aligned data saved to 'aligned_data.csv'")

if __name__ == "__main__":
    main()
