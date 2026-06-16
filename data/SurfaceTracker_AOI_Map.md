# Surface Tracker AOI Map

This document maps the experiment stimuli to screen-coordinate ranges that can
be compared against Pupil Core Surface Tracker output.

Assumption used here:
- Surface Tracker coordinates are normalized to the full tracked screen surface.
- `x` increases left to right.
- `y` increases top to bottom.

If your exported surface coordinates use a bottom-left origin instead, convert
the vertical axis with:

`y_top_left = 1 - y_bottom_left`

## Screen Geometry

The experiment draws a fixed `1024 x 768` canvas centered in the browser
viewport:

- Canvas width: `CW = 1024`
- Canvas height: `CH = 768`
- Viewport width: `W = window.innerWidth`
- Viewport height: `H = window.innerHeight`
- Canvas left edge: `CL = (W - 1024) / 2`
- Canvas top edge: `CT = (H - 768) / 2`

To convert any canvas pixel box to normalized surface coordinates:

- `x_min = (CL + left_px) / W`
- `x_max = (CL + right_px) / W`
- `y_min = (CT + top_px) / H`
- `y_max = (CT + bottom_px) / H`

The full experiment canvas occupies:

- `x = [CL / W, (CL + 1024) / W]`
- `y = [CT / H, (CT + 768) / H]`

## Constant AOIs

These regions do not depend on trial randomization.

### Central Cue Symbol

Used in `baseline` and `delay`.

- Canvas center: `(512, 384)`
- Draw size: `32 x 32`
- Canvas box:
  - `x = [496, 528]`
  - `y = [368, 400]`
- Surface box:
  - `x = [(CL + 496) / W, (CL + 528) / W]`
  - `y = [(CT + 368) / H, (CT + 400) / H]`

### Sample Chart

Used in `sample`.

- Canvas center: `(512, 384)`
- Draw size: `128 x 128`
- Canvas box:
  - `x = [448, 576]`
  - `y = [320, 448]`
- Surface box:
  - `x = [(CL + 448) / W, (CL + 576) / W]`
  - `y = [(CT + 320) / H, (CT + 448) / H]`

### Sample Total Text

Used in `sample`.

- Text anchor center: `(512, 304)`
- Font: `bold 16px Arial`
- Recommended AOI box for analysis:
  - Canvas `x = [432, 592]`
  - Canvas `y = [292, 316]`
- Surface box:
  - `x = [(CL + 432) / W, (CL + 592) / W]`
  - `y = [(CT + 292) / H, (CT + 316) / H]`

### Legend Block

Visible in `instructions`, `baseline`, `sample`, `delay`, `decision`, and
`feedback`.

Legend layout constants:

- `iconSize = 24`
- `rowHeight = 32`
- `startX = 10`
- `startY = 768 - (3 * 32) - 10 = 662`

Legend rows:

1. Different
   - Icon canvas box:
     - `x = [10, 34]`
     - `y = [662, 686]`
   - Label canvas box:
     - `x = [42, 110]`
     - `y = [662, 686]`

2. Same
   - Icon canvas box:
     - `x = [10, 34]`
     - `y = [694, 718]`
   - Label canvas box:
     - `x = [42, 95]`
     - `y = [694, 718]`

3. Quicker
   - Icon canvas box:
     - `x = [10, 34]`
     - `y = [726, 750]`
   - Label canvas box:
     - `x = [42, 105]`
     - `y = [726, 750]`

Whole legend block:

- Canvas `x = [10, 110]`
- Canvas `y = [662, 750]`
- Surface box:
  - `x = [(CL + 10) / W, (CL + 110) / W]`
  - `y = [(CT + 662) / H, (CT + 750) / H]`

## Trial-Dependent AOIs

These depend on trial layout.

### Decision Options

Used in `decision`.

Each option image is drawn at `128 x 128`.

Position centers from the code:

- `up`: `(512, 150)`
- `down`: `(512, 618)`
- `left`: `(200, 384)`
- `right`: `(824, 384)`

All option AOIs are `64 px` around the center on each axis.

#### Up option
- Canvas `x = [448, 576]`
- Canvas `y = [86, 214]`
- Surface:
  - `x = [(CL + 448) / W, (CL + 576) / W]`
  - `y = [(CT + 86) / H, (CT + 214) / H]`

#### Down option
- Canvas `x = [448, 576]`
- Canvas `y = [554, 682]`
- Surface:
  - `x = [(CL + 448) / W, (CL + 576) / W]`
  - `y = [(CT + 554) / H, (CT + 682) / H]`

#### Left option
- Canvas `x = [136, 264]`
- Canvas `y = [320, 448]`
- Surface:
  - `x = [(CL + 136) / W, (CL + 264) / W]`
  - `y = [(CT + 320) / H, (CT + 448) / H]`

#### Right option
- Canvas `x = [760, 888]`
- Canvas `y = [320, 448]`
- Surface:
  - `x = [(CL + 760) / W, (CL + 888) / W]`
  - `y = [(CT + 320) / H, (CT + 448) / H]`

For each trial:

- `choice1_aoi` is whichever of `up/down/left/right` matches
  `trial.choice1Position`
- `choice2_aoi` is whichever of `up/down/left/right` matches
  `trial.choice2Position`

### Catch Prompt

Used in `decision` on catch trials.

- Centered text anchor: `(512, 384)`
- Recommended AOI box:
  - Canvas `x = [352, 672]`
  - Canvas `y = [366, 402]`
- Surface:
  - `x = [(CL + 352) / W, (CL + 672) / W]`
  - `y = [(CT + 366) / H, (CT + 402) / H]`

## Feedback AOIs

Used in `feedback`.

### Left Result Image

- Center: `(341.33, 264)`
- Draw size: `256 x 256`
- Canvas box:
  - `x = [213.33, 469.33]`
  - `y = [136, 392]`
- Surface:
  - `x = [(CL + 213.33) / W, (CL + 469.33) / W]`
  - `y = [(CT + 136) / H, (CT + 392) / H]`

### Right Result Image

- Center: `(682.67, 264)`
- Draw size: `256 x 256`
- Canvas box:
  - `x = [554.67, 810.67]`
  - `y = [136, 392]`
- Surface:
  - `x = [(CL + 554.67) / W, (CL + 810.67) / W]`
  - `y = [(CT + 136) / H, (CT + 392) / H]`

### Left Highlight Box

- Canvas box:
  - `x = [201.33, 481.33]`
  - `y = [124, 404]`

### Right Highlight Box

- Canvas box:
  - `x = [542.67, 822.67]`
  - `y = [124, 404]`

### Left Points Text

- Anchor center: `(341.33, 464)`
- Recommended AOI:
  - Canvas `x = [261.33, 421.33]`
  - Canvas `y = [446, 482]`

### Right Points Text

- Anchor center: `(682.67, 464)`
- Recommended AOI:
  - Canvas `x = [602.67, 762.67]`
  - Canvas `y = [446, 482]`

### Left Summary Text

- Anchor center: `(341.33, 524)`
- Recommended AOI:
  - Canvas `x = [221.33, 461.33]`
  - Canvas `y = [506, 542]`

### Right Summary Text

- Anchor center: `(682.67, 524)`
- Recommended AOI:
  - Canvas `x = [532.67, 832.67]`
  - Canvas `y = [506, 542]`

For all feedback text AOIs above, convert to surface coordinates with the same
formula:

- `x = [(CL + left_px) / W, (CL + right_px) / W]`
- `y = [(CT + top_px) / H, (CT + bottom_px) / H]`

### Catch-Trial Feedback Text

On catch trials there are no images, only two centered summary lines:

- Left catch summary AOI:
  - Canvas `x = [221.33, 461.33]`
  - Canvas `y = [366, 402]`

- Right catch summary AOI:
  - Canvas `x = [532.67, 832.67]`
  - Canvas `y = [366, 402]`

## Blank Phase

`postFeedbackDelay` is intentionally blank. It has no stimulus AOI.

## Example: 1920 x 1080 Fullscreen Display

If the tracked display is exactly `1920 x 1080` and the browser is fullscreen:

- `CL = (1920 - 1024) / 2 = 448`
- `CT = (1080 - 768) / 2 = 156`

Then:

### Full canvas
- `x = [0.2333, 0.7667]`
- `y = [0.1444, 0.8556]`

### Central cue symbol
- `x = [0.4917, 0.5083]`
- `y = [0.4852, 0.5148]`

### Sample chart
- `x = [0.4667, 0.5333]`
- `y = [0.4407, 0.5593]`

### Up option
- `x = [0.4667, 0.5333]`
- `y = [0.2259, 0.3444]`

### Down option
- `x = [0.4667, 0.5333]`
- `y = [0.6593, 0.7778]`

### Left option
- `x = [0.3042, 0.3708]`
- `y = [0.4407, 0.5593]`

### Right option
- `x = [0.6292, 0.6958]`
- `y = [0.4407, 0.5593]`

### Whole legend block
- `x = [0.2385, 0.2906]`
- `y = [0.7574, 0.8389]`

## Recommended Analysis Use

For trial-level comparison against Surface Tracker data:

1. Use the phase log to identify which experiment phase was on screen.
2. Use the trial record to recover `choice1Position` and `choice2Position`.
3. Convert AOIs using the actual tracked surface width and height for that run.
4. If your export uses bottom-left `y`, flip the vertical axis before testing
   AOI membership.

## Source Code Anchors

- Canvas sizing: `experiment.js`, `styles.css`
- Trial stimulus rendering: [experiment.js](/Users/akzeldavila/Documents/Social_Gaze_Experiment/experiment.js:793)
- Decision positions: [TrialManager.js](/Users/akzeldavila/Documents/Social_Gaze_Experiment/TrialManager.js:306)
- Legend layout: [experiment.js](/Users/akzeldavila/Documents/Social_Gaze_Experiment/experiment.js:1324)
