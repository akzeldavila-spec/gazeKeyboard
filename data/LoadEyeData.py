import csv
import msgpack
import numpy as np


# Global Path Definitions
ANNPATH = '/Users/akzeldavila/recordings/2026_05_27/001/annotation_timestamps.npy'
ANNPATH2 = '/Users/akzeldavila/recordings/2026_05_27/001/annotation.pldata'

EYEPATH = '/Users/akzeldavila/recordings/2026_05_27/001/eye0_timestamps.npy'   # right eye
EYEPATH2 = '/Users/akzeldavila/recordings/2026_05_27/001/eye1_timestamps.npy'  # left eye

GAZEPATH = '/Users/akzeldavila/recordings/2026_05_27/001/gaze_timestamps.npy'
GAZEPATH2 = '/Users/akzeldavila/recordings/2026_05_27/001/gaze.pldata'

FIXATIONPATH = '/Users/akzeldavila/recordings/2026_05_27/001/fixations_timestamps.pldata'
FIXATIONPATH2 = '/Users/akzeldavila/recordings/2026_05_27/001/fixations.pldata'

SURFACEPATH = '/Users/akzeldavila/recordings/2026_06_15/000/surfaces_timestamps.npy'
SURFACEPATH2 = '/Users/akzeldavila/recordings/2026_06_15/000/surfaces.pldata'

BLINKPATH = '/Users/akzeldavila/recordings/2026_06_15/000/blinks_timestamps.npy'
BLINKPATH2 = '/Users/akzeldavila/recordings/2026_06_15/000/blinks.pldata'

PUPILPATH = '/Users/akzeldavila/recordings/2026_06_15/000/pupil_timestamps.npy'
PUPILPATH2 = '/Users/akzeldavila/recordings/2026_06_15/000/pupil.pldata'


def _load_pldata(path):
    rows = []
    with open(path, 'rb') as f:
        unpacker = msgpack.Unpacker(f, raw=False)
        for item in unpacker:
            payload_bytes = item[1]
            rows.append(msgpack.unpackb(payload_bytes, raw=False))
    return rows


def _strip_base_data(item):
    if isinstance(item, dict):
        return {key: value for key, value in item.items() if key != 'base_data'}
    return item


def loadEyeTimes():
    right_timestamps = np.load(EYEPATH)
    left_timestamps = np.load(EYEPATH2)

    print(f"Found {len(right_timestamps)} timestamps for the right eye.")
    print(f"Found {len(left_timestamps)} timestamps for the left eye.")
    return right_timestamps, left_timestamps


def loadFixations():
    fixations = _load_pldata(FIXATIONPATH2)
    print(f"Found {len(fixations)} fixation annotations.")
    return fixations


def loadGaze():
    gaze = _load_pldata(GAZEPATH2)
    print(f"Found {len(gaze)} gaze annotations.")
    return gaze


def loadAnnotations():
    annotations = _load_pldata(ANNPATH2)
    print(f"Found {len(annotations)} event annotations.")
    return annotations


def loadSurfaces():
    surfaces = _load_pldata(SURFACEPATH2)
    print(f"Found {len(surfaces)} surface annotations.")
    return surfaces


def loadBlinks():
    blinks = _load_pldata(BLINKPATH2)
    print(f"Found {len(blinks)} blink annotations.")
    return blinks


def loadPupils():
    pupils = _load_pldata(PUPILPATH2)
    print(f"Found {len(pupils)} pupil annotations.")
    return pupils


def build_phase_windows(annotations):
    """Use phase_start annotations as interval boundaries for analysis."""
    phase_starts = sorted(
        (a for a in annotations if a.get('label') == 'phase_start'),
        key=lambda a: a['timestamp']
    )

    windows = []
    for idx, ann in enumerate(phase_starts):
        start_ts = ann['timestamp']
        end_ts = phase_starts[idx + 1]['timestamp'] if idx + 1 < len(phase_starts) else None
        windows.append({
            'trial': ann.get('trial'),
            'phase': ann.get('phase'),
            'start_timestamp': start_ts,
            'end_timestamp': end_ts,
            'annotation': _strip_base_data(ann),
        })
    return windows


def _slice_by_timestamp(rows, start_ts, end_ts):
    if end_ts is None:
        return [_strip_base_data(row) for row in rows if row.get('timestamp') is not None and row['timestamp'] >= start_ts]
    return [
        _strip_base_data(row)
        for row in rows
        if row.get('timestamp') is not None and start_ts <= row['timestamp'] < end_ts
    ]


def _fixation_overlaps_window(fixation, start_ts, end_ts):
    fixation_start = fixation.get('timestamp')
    fixation_duration = fixation.get('duration', 0.0) or 0.0
    fixation_end = fixation_start + fixation_duration

    if end_ts is None:
        return fixation_end >= start_ts
    return fixation_start < end_ts and fixation_end >= start_ts


def _slice_fixations_by_window(fixations, start_ts, end_ts):
    return [
        _strip_base_data(fixation)
        for fixation in fixations
        if fixation.get('timestamp') is not None and _fixation_overlaps_window(fixation, start_ts, end_ts)
    ]


def align_data_to_phases(annotations, gazes, fixations, surfaces=None, blinks=None, pupils=None):
    """
    Segment all eye data by phase windows.
    This is the valid alignment model for later trial/phase analysis.
    """
    surfaces = surfaces or []
    blinks = blinks or []
    pupils = pupils or []

    windows = build_phase_windows(annotations)
    aligned = []

    for window in windows:
        start_ts = window['start_timestamp']
        end_ts = window['end_timestamp']
        aligned.append({
            'trial': window['trial'],
            'phase': window['phase'],
            'start_timestamp': start_ts,
            'end_timestamp': end_ts,
            'annotation': window['annotation'],
            'gaze': _slice_by_timestamp(gazes, start_ts, end_ts),
            'fixations': _slice_fixations_by_window(fixations, start_ts, end_ts),
            'surfaces': _slice_by_timestamp(surfaces, start_ts, end_ts),
            'blinks': _slice_by_timestamp(blinks, start_ts, end_ts),
            'pupils': _slice_by_timestamp(pupils, start_ts, end_ts),
        })

    return aligned


def save_phase_windows_to_csv(aligned_data, filename):
    """
    Writes one row per trial/phase window with sample counts.
    Keep the full aligned_data in Python for detailed gaze/AOI analysis.
    """
    with open(filename, mode='w', newline='') as file:
        writer = csv.writer(file)
        writer.writerow([
            'trial', 'phase', 'start_timestamp', 'end_timestamp',
            'gaze_sample_count', 'fixation_count', 'surface_sample_count', 'blink_count', 'pupil_sample_count'
        ])

        for item in aligned_data:
            writer.writerow([
                item['trial'],
                item['phase'],
                item['start_timestamp'],
                item['end_timestamp'],
                len(item['gaze']),
                len(item['fixations']),
                len(item['surfaces']),
                len(item['blinks']),
                len(item['pupils']),
            ])


def main():
    annotations = loadAnnotations()
    gazes = loadGaze()
    fixations = loadFixations()
    surfaces = loadSurfaces()
    blinks = loadBlinks()
    pupils = loadPupils()

    aligned_data = align_data_to_phases(
        annotations=annotations,
        gazes=gazes,
        fixations=fixations,
        surfaces=surfaces,
        blinks=blinks,
        pupils=pupils,
    )

    print(f"Built {len(aligned_data)} phase windows.")
    if aligned_data:
        first = aligned_data[0]
        print(
            "Example window:",
            f"trial={first['trial']}",
            f"phase={first['phase']}",
            f"gaze_sample_count={len(first['gaze'])}",
            f"fixation_count={len(first['fixations'])}",
            f"surface_sample_count={len(first['surfaces'])}",
            f"blink_count={len(first['blinks'])}",
            f"pupil_sample_count={len(first['pupils'])}",
        )

    # Uncomment to export one-row-per-window counts for sanity checking.
    save_phase_windows_to_csv(aligned_data, 'aligned_phase_windows.csv')


if __name__ == "__main__":
    main()
