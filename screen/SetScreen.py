from pupil_labs.real_time_screen_gaze import marker_generator
import tkinter as tk
import os


#configure the apriltags 
top_left= marker_generator.generate_marker(marker_id=0)
top_right= marker_generator.generate_marker(marker_id=1)
bottom_left= marker_generator.generate_marker(marker_id=2)
bottom_right= marker_generator.generate_marker(marker_id=3)


print(type(top_right))

