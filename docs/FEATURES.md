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
- Per-clip volume 0% (mute) to 200% — Edit tab → Volume opens `VolumeControl` for the selected clip (falls back to the clip under the playhead)
- Global original-audio volume lives in the Audio tab
- Export FFmpeg: `volume=LEVEL` in the segment's `-af` chain

### Crop
- Crop video to specific aspect ratio or custom region
- Presets: Original, 1:1, 4:5, 9:16, 16:9 — plus a live draggable/resizable rectangle over the preview (`components/Preview/crop-overlay.tsx`); Apply commits the draft, Cancel discards
- Export FFmpeg: `crop=W:H:X:Y` in the segment `-vf` chain, clamped to frame bounds with even dims
- Known limit: the rectangle maps to the unrotated source frame (see ROADMAP Known Issues)

### Rotate
- Rotates the **selected clip** (or the clip under the playhead) 90° per tap
- Export FFmpeg: `transpose=1` (90° CW), `transpose=2` (90° CCW), `transpose=1,transpose=1` (180°)

### Delete Segment
- Remove a segment after splitting
- UI: Select segment → tap delete
- Processing: State management only — removed segment excluded from export concat

## Audio Features

### Add Audio
- Add background music track from device (expo-document-picker, `audio/*`); duration probed via FFmpeg; cancel/denial are safe no-ops
- UI: "Add Music" in the Audio tab
- Preview: Play audio alongside video
- Export FFmpeg:
  ```
  -i video.mp4 -i audio.mp3
  -filter_complex "[0:a]volume=V1[a1];[1:a]volume=V2[a2];[a1][a2]amix=inputs=2:duration=first[aout]"
  -map "[aout]"
  ```

### Voiceover
- Record voiceover using device microphone (`expo-audio` `useAudioRecorder` in AudioTools)
- Record/stop flow; the take anchors at the playhead time when recording started; mic-permission denial shows an inline error (waveform visualization still TODO)
- Export: Same as Add Audio — mixed via FFmpeg amix (`-c:a aac` on the muxed output)

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
- **Preview:** Skia **`useVideo`** decodes the source directly, then **`Group`/`fitbox`** (re-rotates storage-orientation frames using the decoder-reported rotation) + **`Image`** + **`ColorMatrix`** applies the preset matrix at full strength. With filters off, preview uses **`expo-video`** `VideoView` only.
- **Export:** the same matrix drives `FFmpegCommandBuilder.colorMatrixToFastFilter()` (`colorchannelmixer` + `lut`). One mathematical pipeline for preview and encode. Filters apply at full strength — there is no intensity control.

## Effect Features

### Zoom In
- Gradual zoom into center over the effect window
- FFmpeg: `zoompan=z='if(between(it,S,E),min(1+0.5*(it-S)/D,1.5),1)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=WxH` (S/E segment-local; size from real dims)

### Zoom Out
- Start zoomed, pull back over the window
- FFmpeg: `zoompan=z='if(between(it,S,E),max(1.5-0.5*(it-S)/D,1),1)':d=1:…:s=WxH`

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
- Camera shake simulation with constant output dims (concat-safe)
- FFmpeg: `crop=iw-20:ih-20:'10+if(between(t,S,E),-5+10*random(0),0)':'…',scale=iw+20:ih+20`

### Flash
- Brightness pulse
- FFmpeg: `-vf "eq=brightness='0.1*sin(2*PI*t*2)'"` (2Hz flash)

## Sticker Features

### Add Sticker
- Place image sticker on video at time range
- UI: "Choose Sticker from Gallery" (expo-image-picker) → added at the playhead → drag to position; cancel is a safe no-op
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
