import csv

def align_data(annotations, fixations, gazes):
    """
    Aligns annotations, fixations, and gaze data based on the timestamp of the annotations.
    
    Parameters:
    - annotations: List of dictionaries containing annotation data with 'timestamp' key.
    - fixations: List of dictionaries containing fixation data with 'timestamp' key.
    - gazes: List of dictionaries containing gaze data with 'timestamp' key.
    
    Returns:
    - aligned_data: List of lists, each containing aligned annotation, fixation, and gaze data.
    """
    aligned_data = []
    i, j, k = 0, 0, 0
    
    while i < len(annotations) and j < len(fixations) and k < len(gazes):
        if annotations[i]['timestamp'] == fixations[j]['timestamp'] == gazes[k]['timestamp']:
            aligned_data.append([annotations[i], fixations[j], gazes[k]])
            i += 1
            j += 1
            k += 1
        elif annotations[i]['timestamp'] < fixations[j]['timestamp']:
            i += 1
        elif annotations[i]['timestamp'] < gazes[k]['timestamp']:
            i += 1
        else:
            if fixations[j]['timestamp'] == gazes[k]['timestamp']:
                aligned_data.append([annotations[i], fixations[j], gazes[k]])
                j += 1
                k += 1
            elif fixations[j]['timestamp'] < gazes[k]['timestamp']:
                j += 1
            else:
                k += 1
    
    return aligned_data

def save_aligned_data_to_csv(aligned_data, filename):
    """
    Saves the aligned data to a CSV file.
    
    Parameters:
    - aligned_data: List of lists, each containing aligned annotation, fixation, and gaze data.
    - filename: String, the name of the output CSV file.
    """
    with open(filename, mode='w', newline='') as file:
        writer = csv.writer(file)
        
        # Write header
        if aligned_data:
            headers = ['annotation_timestamp', 'fixation_timestamp', 'gaze_timestamp']
            for key in aligned_data[0][0].keys():
                headers.append(f'annotation_{key}')
            for key in aligned_data[0][1].keys():
                headers.append(f'fixation_{key}')
            for key in aligned_data[0][2].keys():
                headers.append(f'gaze_{key}')
            writer.writerow(headers)
        
        # Write data
        for annotation, fixation, gaze in aligned_data:
            row = [annotation['timestamp'], fixation['timestamp'], gaze['timestamp']]
            for value in annotation.values():
                row.append(value)
            for value in fixation.values():
                row.append(value)
            for value in gaze.values():
                row.append(value)
            writer.writerow(row)

# Example usage
if __name__ == '__main__':
    # Load data (this part should be replaced with actual data loading logic)
    annotations = [{'timestamp': 100, 'value': 'A'}, {'timestamp': 200, 'value': 'B'}]
    fixations = [{'timestamp': 150, 'x': 10, 'y': 20}, {'timestamp': 250, 'x': 30, 'y': 40}]
    gazes = [{'timestamp': 150, 'x': 50, 'y': 60}, {'timestamp': 250, 'x': 70, 'y': 80}]
    
    aligned_data = align_data(annotations, fixations, gazes)
    save_aligned_data_to_csv(aligned_data, 'aligned_data.csv')
