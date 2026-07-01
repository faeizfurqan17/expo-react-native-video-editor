# Feature Specifications

## Edit Features

### Split
- Splits video at current playhead position into two segments
- UI: Tap "split" button at desired time
- Processing: No FFmpeg needed at split time — just state management. On export: `ffmpeg -i input.mp4 -ss START -to END -c copy segment.mp4` per segment, then concat

### Speed Control
- Adjust playback speed per segment: 0.25x, 0.5x, 1x, 1.5x, 2x, 3x
- UI: Slider control
- Preview: `expo-video` (or Skia `useVideo` when a color filter is active) — segment timeline logic shared
- Export FFmpeg:
  ```
  -filter:v "setpts=PTS/SPEED"
  -filter:a "atempo=SPEED"
  ```
  Note: atempo only supports 0.5-2.0, chain multiple for extreme speeds

### Volume Control
- Adjust video's original audio volume: 0% (mute) to 200%
- UI: Slider control
- Preview: `expo-video` volume property
- Export FFmpeg: `-filter:a "volume=LEVEL"`

### Crop
- Crop video to specific aspect ratio or custom region
- Presets: Original, 1:1, 4:5, 9:16, 16:9
- UI: Draggable crop rectangle overlay
- Preview: Crop state drives export; full live crop preview may be simplified in UI
- Export FFmpeg: `crop=W:H:X:Y` in the segment `-vf` chain

### Rotate
- Rotate video 90°, 180°, 270°
- UI: Rotate button (cycles through)
- Export FFmpeg: `transpose=1` (90° CW), `transpose=2` (90° CCW), `transpose=1,transpose=1` (180°)

### Delete Segment
- Remove a segment after splitting
- UI: Select segment → tap delete
- Processing: State management only — removed segment excluded from export concat

## Audio Features

### Add Audio
- Add background music track from device or bundled audio
- UI: Audio browser/picker
- Preview: Play audio alongside video
- Export FFmpeg:
  ```
  -i video.mp4 -i audio.mp3
  -filter_complex "[0:a]volume=V1[a1];[1:a]volume=V2[a2];[a1][a2]amix=inputs=2:duration=first[aout]"
  -map "[aout]"
  ```

### Voiceover
- Record voiceover using device microphone
- UI: Record button with waveform visualization
- Recording: `expo-audio` `useAudioRecorder` hook
- Export: Same as Add Audio — mixed via FFmpeg amix

## Text Features

### Add Text
- Add text overlay at specific position and time range
- UI: Text input → positioned on video preview
- Preview: Skia `<Text>` component on canvas overlay
- Export FFmpeg:
  ```
  -vf "drawtext=text='CONTENT':fontfile=FONT:fontsize=SIZE:fontcolor=COLOR:x=X:y=Y:enable='between(t,START,END)'"
  ```

### Font Selection
- Choose from bundled fonts
- UI: Horizontal font picker showing font previews

### Text Color
- Pick text color with opacity
- UI: Color wheel/palette picker

### Text Highlight/Background
- Add background color behind text
- Preview: Skia `<RoundedRect>` behind text
- Export FFmpeg: `drawtext` with `box=1:boxcolor=COLOR:boxborderw=PADDING`

### Text Alignment
- Left, center, right alignment
- UI: Alignment toggle buttons

## Filter Features

### Color-matrix filters
- Built-in presets: Normal, Norway, Neon, Retro, Warm, Cool, B&W, Vintage, Sunset, Film, Fade (`packages/video-editor/src/filters/presets.ts`)
- **Preview:** Skia **`useVideo`** + **`ImageShader`** + **`ColorMatrix`** using the same matrix as the preset, with **`applyIntensity()`** for the slider. With filters off, preview uses **`expo-video`** `VideoView` only (single decoder path).
- **Export:** FFmpeg **`geq`** on RGB, generated from that matrix after `applyIntensity()` (`FFmpegCommandBuilder.colorMatrixToGeqFilter`). One mathematical pipeline for preview and encode.

### Filter Intensity
- Slider 0–1: `applyIntensity(filterMatrix, intensity)` blends each coefficient toward the identity matrix.
- Same function is used for preview and for the matrix passed into export `geq` (no separate `mix` blend step).

## Effect Features

### Zoom In
- Gradual zoom into center
- FFmpeg: `-vf "zoompan=z='min(zoom+0.0015,1.5)':d=DURATION*FPS:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"`

### Zoom Out
- Start zoomed, pull back
- FFmpeg: `-vf "zoompan=z='if(lte(zoom,1.0),1.5,max(1.001,zoom-0.0015))':d=DURATION*FPS"`

### Glitch
- Random RGB channel displacement
- FFmpeg: `-vf "rgbashift=rh=-5:gh=3:bh=7,noise=alls=20:allf=t"`

### VHS
- Retro VHS look with chromatic aberration, noise, scanlines
- FFmpeg: `-vf "noise=alls=30:allf=t,eq=contrast=1.1:brightness=0.05,rgbashift=rh=3:bv=-2"`

### Soul
- Ghost/echo effect with fading copies
- FFmpeg: `-vf "split[a][b];[b]fade=t=in:st=0:d=0.5,setpts=PTS+0.1/TB[b];[a][b]overlay=format=auto:alpha=premultiplied"`

### Shake
- Camera shake simulation
- FFmpeg: Random translate per frame via expression

### Flash
- Brightness pulse
- FFmpeg: `-vf "eq=brightness='0.1*sin(2*PI*t*2)'"` (2Hz flash)

## Sticker Features

### Add Sticker
- Place image/GIF sticker on video at time range
- UI: Sticker picker grid → tap to add → drag to position
- Preview: Skia `<Image>` on canvas, draggable/resizable/rotatable via gesture-handler
- Export FFmpeg:
  ```
  -i video.mp4 -i sticker.png
  -filter_complex "[1:v]scale=W:H[s];[0:v][s]overlay=X:Y:enable='between(t,START,END)'"
  ```

### Sticker Transform
- Drag: Move position
- Pinch: Resize
- Two-finger rotate: Rotate
- All via `react-native-gesture-handler` simultaneous gestures
