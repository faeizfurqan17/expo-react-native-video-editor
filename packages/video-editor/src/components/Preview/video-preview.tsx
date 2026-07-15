import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Platform, PixelRatio } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Image } from 'expo-image';
import {
  Canvas,
  Fill,
  Group,
  Image as SkiaImage,
  ColorMatrix,
  fitbox,
  rect,
  useImage,
} from '@shopify/react-native-skia';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, Directions } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import type { FilterPreset, SourceType, StickerOverlay, TextOverlay } from '../../core/types';
import { getFilterByPreset } from '../../filters/presets';
import { fitRect, clamp01 } from '../../utils/layout';
import { useSkiaFilteredFrame } from './use-skia-filtered-frame';
import { NativeGradedVideoPlayer } from './graded-video-player';

// iOS ships a standalone native module (GradedVideoPlayer, see
// graded-video-player.ts) that applies color grading via
// AVMutableVideoComposition + CIColorMatrix inside AVFoundation's own
// decode/composite pipeline — no separate Skia/Metal readback path, no
// second concurrent decoder. This eliminates the whole class of preview
// lag/stretch/stall bugs the Skia dual-decoder path required a stall
// watchdog and OOM fallback for (see showSkiaColorGrade below), for video
// color filters specifically. Android has no AVFoundation equivalent, so it
// keeps the existing Skia decode path unchanged. Stickers/text/still-image
// filtering are unrelated to this and unaffected on either platform.
const USE_NATIVE_COLOR_GRADE = Platform.OS === 'ios';

const TRASH_ZONE_HEIGHT = 96;

// Skia's useVideo throws on Android below API 26 (Android 8) — the exception
// escapes into the Reanimated runtime and freezes the UI. Gate it up front.
const SKIA_VIDEO_SUPPORTED =
  Platform.OS === 'ios' ||
  (typeof Platform.Version === 'number'
    ? Platform.Version
    : parseInt(String(Platform.Version), 10)) >= 26;

interface VideoPreviewProps {
  sourceUri: string;
  sourceType: SourceType;
  sourceWidth: number;
  sourceHeight: number;
  /** Container size — the preview fills the screen behind the chrome. */
  width: number;
  height: number;
  isPlaying: boolean;
  muted: boolean;
  filterPreset: FilterPreset;
  textOverlays: TextOverlay[];
  stickerOverlays: StickerOverlay[];
  selectedOverlayId: string | null;
  onOverlaySelect: (id: string | null) => void;
  /** Tap on an existing text overlay → reopen the text editor. */
  onTextEdit: (id: string) => void;
  onTextChange: (id: string, updates: Partial<TextOverlay>) => void;
  onStickerChange: (id: string, updates: Partial<StickerOverlay>) => void;
  onRemoveOverlay: (id: string, kind: 'text' | 'sticker') => void;
  /** Horizontal swipe over the video — filter carousel prev/next. */
  onSwipeFilter: (direction: 1 | -1) => void;
  /** Text overlay view refs for export-time Skia rasterization. */
  registerTextView?: (id: string, view: unknown | null) => void;
  /** Bump (e.g. Date.now()) to seek playback back to 0 — e.g. when music is
   * added, so the story replays from the start in sync with the new track. */
  restartToken?: number;
}

export function VideoPreview({
  sourceUri,
  sourceType,
  sourceWidth,
  sourceHeight,
  width,
  height,
  isPlaying,
  muted,
  filterPreset,
  textOverlays,
  stickerOverlays,
  selectedOverlayId,
  onOverlaySelect,
  onTextEdit,
  onTextChange,
  onStickerChange,
  onRemoveOverlay,
  onSwipeFilter,
  registerTextView,
  restartToken,
}: VideoPreviewProps) {
  // Editing surface = the largest 9:16 story canvas that fits the screen
  // (IG model). Overlays are normalized against THIS canvas and can sit
  // anywhere on it — including over the letterbox bars. Export mirrors it
  // with a 1080×1920 canvas, so placement stays WYSIWYG.
  const canvasRect = useMemo(() => fitRect(9, 16, width, height), [width, height]);

  // Where the video itself lands, contain-fit inside the canvas.
  const videoRect = useMemo(() => {
    const r = fitRect(sourceWidth, sourceHeight, canvasRect.width, canvasRect.height);
    return { x: canvasRect.x + r.x, y: canvasRect.y + r.y, width: r.width, height: r.height };
  }, [sourceWidth, sourceHeight, canvasRect]);

  const isVideo = sourceType === 'video';
  // Once the Skia decoder proves broken on this device (Android pre-release
  // useVideo stalls), fall back to native playback for the whole session —
  // filters stop live-previewing but the video never freezes, and export
  // still burns the real filter in.
  const [skiaBroken, setSkiaBroken] = useState(false);
  const [anyDragging, setAnyDragging] = useState(false);

  // Skia decodes the full-res original directly — a lower-res transcoded
  // proxy was tried here but visibly softened the filtered preview and cost
  // a multi-second wait before the first filter could show. Android's
  // per-frame GPU→CPU copy at full res is a real OOM risk on some devices;
  // the stall watchdog below and skiaBroken fallback catch that instead of
  // pre-emptively downscaling everyone.
  //
  // The Skia decoder is a SECOND full decode pipeline running alongside the
  // native expo-video player — its own AVPlayer on iOS (useVideo) or its own
  // native VideoPlayer/MediaCodec instance on Android (see
  // use-skia-filtered-frame.ts) — with its own decode buffers and
  // GPU textures. Creating it unconditionally the moment ANY video loads
  // means two concurrent full-res decoders at mount on both platforms,
  // which is a guaranteed large memory spike on big source files (e.g. a
  // 1170x2532 screen recording spiked to ~2GB and crashed on load before
  // this fix). So it's created lazily: only once the user actually picks a
  // non-normal filter for the first time (hasUsedFilter latches true and
  // never resets for the session) — but once armed, it STAYS mounted across
  // subsequent filter switches, including back to 'normal' (rendered with an
  // identity ColorMatrix, pixel-identical to native). That "stay mounted
  // once armed" part is what avoids the ORIGINAL bug this architecture
  // fixed: gating Skia directly on filterPreset used to tear down/recreate
  // the whole decoder (pause+mute one path, unpause+unmute the other, reseek
  // on iOS) on every single filter tap, causing a visible timing glitch.
  const [hasUsedFilter, setHasUsedFilter] = useState(filterPreset !== 'normal');
  useEffect(() => {
    if (filterPreset !== 'normal') setHasUsedFilter(true);
  }, [filterPreset]);
  // On iOS, GradedVideoPlayer (AVMutableVideoComposition + CIColorMatrix)
  // handles color grading natively — the Skia dual-decoder path is only
  // needed as a fallback if that native module isn't present (e.g. an app
  // that hasn't rebuilt after adding this library version yet).
  const nativeColorGradeAvailable = USE_NATIVE_COLOR_GRADE && NativeGradedVideoPlayer != null;
  const skiaVideoSource =
    !isVideo || nativeColorGradeAvailable || !SKIA_VIDEO_SUPPORTED || skiaBroken || !hasUsedFilter
      ? null
      : sourceUri;
  const showSkiaColorGrade = isVideo && skiaVideoSource !== null;
  const showNativeColorGrade =
    isVideo && nativeColorGradeAvailable && filterPreset !== 'normal';

  // Android has no GradedVideoPlayer equivalent, so showSkiaColorGrade there
  // means TWO concurrent full-res decoders exist at once: the native
  // ExoPlayer-backed VideoView (kept mounted, just paused+hidden — pausing
  // does NOT release its MediaCodec instance) and Skia's own decode of the
  // same file. Confirmed via a real crash: a 4K60 source OOM'd inside
  // ExoPlayer's MediaCodecRenderer the moment a filter was applied,
  // "Failed to allocate ... target footprint 268435456" (the 256MB per-app
  // Java heap ceiling) — two HEVC decoders on one file blew the budget.
  // Below this threshold, keep both mounted (cheap, avoids remount glitches
  // on filter taps); at/above it, the native player's source is released
  // whenever Skia is the active surface, trading a brief remount cost for
  // not crashing.
  const HEAVY_SOURCE_PIXEL_THRESHOLD = 3840 * 2160; // 4K
  const isHeavySource = sourceWidth * sourceHeight >= HEAVY_SOURCE_PIXEL_THRESHOLD;
  const releaseNativePlayerForSkia =
    Platform.OS === 'android' && showSkiaColorGrade && isHeavySource;

  // A still image has no per-frame decode cost at all, so it always renders
  // through Skia — no native-vs-Skia tradeoff to make the way video has.
  // Loaded once; `useImage` returns null until decode completes.
  const stillImage = useImage(isVideo ? null : sourceUri);
  const stillImageTransform = useMemo(() => {
    if (!stillImage) return null;
    return fitbox(
      'contain',
      rect(0, 0, stillImage.width(), stillImage.height()),
      rect(0, 0, videoRect.width, videoRect.height)
    );
  }, [stillImage, videoRect]);

  // --- Native path (no filter, or non-iOS): expo-video, looping ---
  // Source is null (releasing the underlying MediaCodec/decoder) when
  // GradedVideoPlayer owns iOS playback, OR when Android's Skia decoder is
  // active on a heavy source that would otherwise OOM with two concurrent
  // decoders — see releaseNativePlayerForSkia above.
  const player = useVideoPlayer(
    isVideo && !showNativeColorGrade && !releaseNativePlayerForSkia ? sourceUri : null,
    (p) => {
      p.loop = true;
      p.timeUpdateEventInterval = 0;
    }
  );

  // --- Native color-grade path (iOS filtered video): GradedVideoPlayer ---
  // One native view handles both filtered and unfiltered iOS video — swap
  // its colorMatrix prop rather than switching decoders, so there's no
  // second concurrent AVPlayer instance the way the Skia dual-decoder path
  // required.
  type GradedPlayerHandle = {
    play: () => Promise<void>;
    pause: () => Promise<void>;
    seekTo: (seconds: number) => Promise<void>;
  };
  const gradedPlayerRef = useRef<GradedPlayerHandle | null>(null);
  // Mirrors `isPlaying` into a ref so the play-state applier and the ref
  // callback below can read the latest value without needing isPlaying in
  // their own dependency arrays — keeping setGradedPlayerRef's identity
  // permanently stable. A callback ref whose identity changes gets
  // detached-and-reattached by React on every such render, and Expo's
  // Fabric view wrapper treats that reattachment as needing to resync all
  // props via native commands — which was causing setSource (and the
  // expensive AVPlayerItem reload it triggers) to re-fire on every render
  // instead of once.
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  // Calling a Fabric view-scoped native function (play/pause/seekTo)
  // immediately on ref-attach can race Fabric's own commit: the JS ref
  // reports attached with a native tag before that tag has actually been
  // mounted into the native view hierarchy, so the call fails with "Unable
  // to find the '<View>' view with tag '<n>'" — confirmed empirically (this
  // is why the call only succeeded right after a Fast Refresh remount, which
  // gave Fabric extra time to settle before anything called play()). A short
  // retry absorbs that gap without needing a native onLoad event.
  const applyGradedPlayState = useCallback((attempt = 0) => {
    const handle = gradedPlayerRef.current;
    if (!handle) return;
    const action = isPlayingRef.current ? handle.play() : handle.pause();
    action?.catch(() => {
      if (attempt < 5) {
        setTimeout(() => applyGradedPlayState(attempt + 1), 50 * (attempt + 1));
      }
    });
  }, []);
  // The native view's imperative handle isn't guaranteed attached yet on the
  // same render that mounts it (showNativeColorGrade flipping true), so an
  // isPlaying-keyed effect can fire once against a still-null ref and then
  // never re-run (isPlaying itself doesn't change on a filter tap). Setting
  // the ref callback also applies the current play state the moment the
  // native view actually attaches, closing that race.
  const setGradedPlayerRef = useCallback((handle: GradedPlayerHandle | null) => {
    gradedPlayerRef.current = handle;
    if (handle) applyGradedPlayState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const gradedColorMatrix = useMemo(() => {
    if (!showNativeColorGrade) return null;
    return getFilterByPreset(filterPreset).colorMatrix;
  }, [showNativeColorGrade, filterPreset]);
  useEffect(() => {
    if (!showNativeColorGrade) return;
    applyGradedPlayState();
  }, [showNativeColorGrade, isPlaying, applyGradedPlayState]);
  const isFirstRestartTokenForGradedRef = useRef(true);
  useEffect(() => {
    if (isFirstRestartTokenForGradedRef.current) {
      isFirstRestartTokenForGradedRef.current = false;
      return;
    }
    if (!showNativeColorGrade) return;
    gradedPlayerRef.current?.seekTo(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartToken]);

  // --- Skia path (filter active): useVideo decodes, ColorMatrix grades ---
  const skiaPaused = useSharedValue(!isPlaying);
  const skiaSeek = useSharedValue<number | null>(null);
  const skiaVolume = useSharedValue(0);
  // null on unsupported devices or after a Skia stall — no decoder is
  // created until the filter path is actually needed.
  const onSkiaBroken = useCallback(() => {
    console.warn(
      '[video-editor] Skia video decode broken (all recreate attempts exhausted) — using native preview; filter still applies on export.'
    );
    setSkiaBroken(true);
  }, []);
  // Cap the Skia decoder's target resolution instead of decoding the
  // source's raw file resolution — a heavy source (e.g. 4K60/HDR) decoded at
  // full size lags and can eventually exhaust the decoder's recreate budget
  // (see requestPlayerRecreate in use-skia-filtered-frame.ts) after a
  // period of struggling to keep up, falling back to unfiltered native
  // preview. Export is unaffected — it always re-reads the original file at
  // full resolution via FFmpeg, never this capped preview decode.
  //
  // createVideoPlayer's resolution option is applied to the native decoder
  // BEFORE the track's rotation is known (rotation is discovered later,
  // asynchronously) — see RNSVVideoPlayer.mm's constructor, which sets
  // kCVPixelBufferWidthKey/HeightKey on AVPlayerItemVideoOutput immediately.
  // AVPlayerItemVideoOutput does NOT aspect-preserve when given an explicit
  // width/height — it stretches to exactly fill them (confirmed empirically:
  // a SQUARE request came back as a literally square 2080x2080 texture,
  // squashing the video). So the requested size must already be in the
  // SAME aspect ratio the buffer will actually be produced at.
  //
  // sourceWidth/sourceHeight (this component's own props) are already
  // DISPLAY-oriented (post-rotation — e.g. portrait 2160x3840 for a
  // portrait phone recording, confirmed via getMediaInfo's ffprobe-derived
  // dims). Scaling that same aspect ratio down to the on-screen preview
  // size is the only value we can compute without knowing the raw/pre-
  // rotation dims (which would require threading the exact rotation angle
  // through from getMediaInfo — not currently plumbed to this component).
  const skiaDecodeResolution = useMemo(() => {
    if (!sourceWidth || !sourceHeight || !videoRect.width || !videoRect.height) return null;
    const pixelRatio = PixelRatio.get();
    // Decode at half the display density (e.g. ~1.5x on a 3x device).
    // Full-density decode makes the per-frame GPU cost (HDR tone-map +
    // texture copy + Skia sampling, all proportional to pixel count) exceed
    // the GPU's sustained clock envelope on older devices for heavy sources
    // like 4K60 HDR — playback then holds 60fps only during iOS's
    // several-second post-touch clock boost and sags to ~30 once it expires.
    // Half density quarters that cost; upscaled ~2x in a moving preview the
    // difference is barely perceptible. Rounded to even dims for the video
    // pipeline's sake.
    const PREVIEW_DENSITY_SCALE = 0.5;
    const targetW =
      Math.round((videoRect.width * pixelRatio * PREVIEW_DENSITY_SCALE) / 2) * 2;
    const targetH =
      Math.round((videoRect.height * pixelRatio * PREVIEW_DENSITY_SCALE) / 2) * 2;
    // Never upscale a source that's already smaller than the display target.
    if (targetW >= sourceWidth && targetH >= sourceHeight) return null;
    return { width: Math.min(targetW, sourceWidth), height: Math.min(targetH, sourceHeight) };
  }, [sourceWidth, sourceHeight, videoRect.width, videoRect.height]);
  const {
    currentFrame: skiaVideoFrame,
    currentTime: skiaClockMs,
    size: skiaFrameSize,
    rotation: skiaRotation,
  } = useSkiaFilteredFrame(skiaVideoSource, {
    paused: skiaPaused,
    seek: skiaSeek,
    looping: true,
    volume: skiaVolume,
    resolution: skiaDecodeResolution,
    onBroken: onSkiaBroken,
  });

  // Maps raw decoded frames into the on-screen rect. useVideo hands back
  // storage-orientation frames (portrait phone footage decodes as landscape
  // pixels), so fitbox re-rotates using the rotation the decoder reports.
  const skiaFrameTransform = useMemo(() => {
    if (!skiaFrameSize.width || !skiaFrameSize.height) return null;
    return fitbox(
      'contain',
      rect(0, 0, skiaFrameSize.width, skiaFrameSize.height),
      rect(0, 0, videoRect.width, videoRect.height),
      skiaRotation as 0 | 90 | 180 | 270
    );
  }, [skiaFrameSize, skiaRotation, videoRect]);

  // Track previous value so we only seek when first enabling Skia color grading.
  // Android: skip the initial seek entirely — MediaCodec-backed useVideo can
  // stall on seek; the clip loops anyway so joining from 0 is fine.
  const prevShowSkiaRef = useRef(showSkiaColorGrade);
  useEffect(() => {
    const was = prevShowSkiaRef.current;
    prevShowSkiaRef.current = showSkiaColorGrade;
    if (!was && showSkiaColorGrade && Platform.OS === 'ios') {
      skiaSeek.value = Math.round(player.currentTime * 1000);
    }
  }, [showSkiaColorGrade, skiaSeek, player]);

  // Restart both decode paths to 0 on demand (music added, or its trim
  // window moved) — seek whichever is active AND the inactive one, so
  // switching filters later doesn't resume from a stale mid-clip position
  // on the other path.
  const isFirstRestartTokenRef = useRef(true);
  useEffect(() => {
    if (isFirstRestartTokenRef.current) {
      isFirstRestartTokenRef.current = false;
      return;
    }
    if (!isVideo) return;
    player.currentTime = 0;
    skiaSeek.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartToken]);

  // Single active decoder path: pause+mute whichever isn't visible.
  // No-op for a still image — player was created with a null source and
  // there's no decoder to pause/mute either way.
  useEffect(() => {
    if (!isVideo) return;
    if (showSkiaColorGrade) {
      player.pause();
      player.muted = true;
      skiaPaused.value = !isPlaying;
      skiaVolume.value = muted ? 0 : 1;
      return;
    }
    skiaPaused.value = true;
    skiaVolume.value = 0;
    player.muted = muted;
    if (isPlaying) {
      player.play();
    } else {
      player.pause();
    }
  }, [isVideo, isPlaying, muted, showSkiaColorGrade, player, skiaPaused, skiaVolume]);

  // --- Absolute backstop: fall back if skiaFrameSize never gets real dims ---
  // The stall watchdog below is gated on skiaFrameSize being non-zero, so it
  // can't fire when the decoder never produces frames at all (all ready events
  // return {w:0,h:0}). This timeout closes that gap: if Skia is active and
  // playing but skiaFrameSize is still zero after 8 s, give up on Skia.
  useEffect(() => {
    if (!showSkiaColorGrade || !isPlaying) return;
    if (skiaFrameSize.width && skiaFrameSize.height) return; // already good
    const timer = setTimeout(() => {
      // Re-check inside the timeout — it may have resolved in the meantime.
      if (!skiaFrameSize.width || !skiaFrameSize.height) {
        console.warn(
          '[video-editor] Skia decoder never produced frames in 8 s — using native preview; filter still applies on export.'
        );
        setSkiaBroken(true);
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [showSkiaColorGrade, isPlaying, skiaFrameSize.width, skiaFrameSize.height]);

  // --- Stall watchdog: recover instead of freezing when Skia decode hangs ---
  const lastFrameTickRef = useRef(Date.now());
  const stallRetriedRef = useRef(false);
  const bumpFrameTick = useCallback(() => {
    lastFrameTickRef.current = Date.now();
  }, []);
  useAnimatedReaction(
    () => skiaClockMs.value,
    (ms, prev) => {
      if (ms !== prev) runOnJS(bumpFrameTick)();
    },
    [bumpFrameTick]
  );
  useEffect(() => {
    if (!showSkiaColorGrade || !isPlaying) return;
    // Don't arm the stall clock until the decoder has emitted a valid 'ready'
    // event (non-zero skiaFrameSize). Before that point the player is still
    // in MediaCodec cold-start / EGL init — null-frames during that window
    // are expected and should not be counted as a stall.
    if (!skiaFrameSize.width || !skiaFrameSize.height) return;
    lastFrameTickRef.current = Date.now();
    stallRetriedRef.current = false;
    const interval = setInterval(() => {
      // Allow 3 s of silence before treating it as a real stall; MediaCodec
      // can legitimately take 1–2 s to fill its first output buffer.
      if (Date.now() - lastFrameTickRef.current < 3000) return;
      if (!stallRetriedRef.current) {
        // First stall: nudge the decoder back to the start once.
        stallRetriedRef.current = true;
        skiaSeek.value = 0;
        lastFrameTickRef.current = Date.now();
      } else {
        console.warn(
          '[video-editor] Skia video decode stalled — using native preview; filter still applies on export.'
        );
        setSkiaBroken(true);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [showSkiaColorGrade, isPlaying, skiaSeek, skiaFrameSize.width, skiaFrameSize.height]);

  const filterColorMatrix = useMemo(() => {
    if (!showSkiaColorGrade) return null;
    return getFilterByPreset(filterPreset).colorMatrix;
  }, [showSkiaColorGrade, filterPreset]);

  // Still images always render via Skia (filtered or not — there's no cheap
  // "native" alternative the way VideoView is for unfiltered video), so this
  // isn't gated behind showSkiaColorGrade the way filterColorMatrix is.
  const stillImageColorMatrix = useMemo(() => {
    if (isVideo || filterPreset === 'normal') return null;
    return getFilterByPreset(filterPreset).colorMatrix;
  }, [isVideo, filterPreset]);

  // Keep VideoView mounted whenever it's the active decoder and just
  // opacity-toggle it. Unmounting on every filter tap was tried and reverted
  // for NORMAL-sized clips — the remount cost was worse than the codec-pool
  // contention risk it avoided. Not rendered at all for a still image, on
  // iOS once GradedVideoPlayer has taken over as the sole video surface, or
  // on Android when releaseNativePlayerForSkia has released its source
  // (player.currentTime/etc. are meaningless with no item loaded, and
  // rendering a VideoView with nothing to show is pointless).
  const nativeViewMounted = isVideo && !showNativeColorGrade && !releaseNativePlayerForSkia;

  // Horizontal fling → filter carousel. Vertical stays free for system gestures.
  // Swiping left advances to the next filter (content moves left), IG-style.
  const flingLeft = Gesture.Fling()
    .direction(Directions.LEFT)
    .onEnd(() => {
      runOnJS(onSwipeFilter)(1);
    });
  const flingRight = Gesture.Fling()
    .direction(Directions.RIGHT)
    .onEnd(() => {
      runOnJS(onSwipeFilter)(-1);
    });
  const backgroundTap = Gesture.Tap().onEnd(() => {
    runOnJS(onOverlaySelect)(null);
  });
  const backgroundGestures = Gesture.Race(flingLeft, flingRight, backgroundTap);

  return (
    <View style={{ width, height, backgroundColor: '#000' }}>
      <GestureDetector gesture={backgroundGestures}>
        <View style={{ width, height }}>
          {/* Mounted on both platforms whenever there's a video source, but
              paused+muted+opacity-0 for the entire session now that Skia is
              the always-on decoder — this is only the fallback surface for
              when Skia is unsupported/broken on the device. */}
          {showNativeColorGrade && NativeGradedVideoPlayer && (
            <NativeGradedVideoPlayer
              ref={setGradedPlayerRef}
              source={sourceUri}
              loop
              muted={muted}
              colorMatrix={gradedColorMatrix}
              style={{
                position: 'absolute',
                left: canvasRect.x,
                top: canvasRect.y,
                width: canvasRect.width,
                height: canvasRect.height,
              }}
            />
          )}

          {nativeViewMounted && (
            <VideoView
              player={player}
              style={{
                position: 'absolute',
                left: canvasRect.x,
                top: canvasRect.y,
                width: canvasRect.width,
                height: canvasRect.height,
                opacity: showSkiaColorGrade ? 0 : 1,
              }}
              contentFit="contain"
              nativeControls={false}
            />
          )}

          {showSkiaColorGrade && filterColorMatrix && (
            <Canvas
              style={{
                position: 'absolute',
                left: videoRect.x,
                top: videoRect.y,
                width: videoRect.width,
                height: videoRect.height,
              }}
              pointerEvents="none"
            >
              {skiaFrameTransform ? (
                <Group transform={skiaFrameTransform}>
                  <SkiaImage
                    image={skiaVideoFrame}
                    x={0}
                    y={0}
                    width={skiaFrameSize.width}
                    height={skiaFrameSize.height}
                    fit="fill"
                  >
                    <ColorMatrix matrix={filterColorMatrix} />
                  </SkiaImage>
                </Group>
              ) : (
                <Fill color="#000" />
              )}
            </Canvas>
          )}

          {/* Still image source — one static SkImage, filtered or not, no decode loop. */}
          {!isVideo && (
            <Canvas
              style={{
                position: 'absolute',
                left: videoRect.x,
                top: videoRect.y,
                width: videoRect.width,
                height: videoRect.height,
              }}
              pointerEvents="none"
            >
              {stillImage && stillImageTransform ? (
                <Group transform={stillImageTransform}>
                  <SkiaImage
                    image={stillImage}
                    x={0}
                    y={0}
                    width={stillImage.width()}
                    height={stillImage.height()}
                    fit="fill"
                  >
                    {stillImageColorMatrix && <ColorMatrix matrix={stillImageColorMatrix} />}
                  </SkiaImage>
                </Group>
              ) : (
                <Fill color="#000" />
              )}
            </Canvas>
          )}
        </View>
      </GestureDetector>

      {/* Sticker overlays — expo-image animates GIFs natively in preview */}
      {stickerOverlays.map((s) => (
        <DraggableOverlay
          key={s.id}
          id={s.id}
          kind="sticker"
          bounds={canvasRect}
          containerHeight={height}
          position={s.position}
          scale={s.scale}
          rotation={s.rotation}
          allowRotate
          isSelected={s.id === selectedOverlayId}
          onSelect={() => onOverlaySelect(s.id)}
          onTap={() => onOverlaySelect(s.id)}
          onCommit={(pos, scale, rotation) =>
            onStickerChange(s.id, { position: pos, scale, rotation })
          }
          onRemove={() => onRemoveOverlay(s.id, 'sticker')}
          onDraggingChange={setAnyDragging}
        >
          <Image
            source={{ uri: s.uri }}
            style={{ width: s.size.width, height: s.size.height }}
            contentFit="contain"
          />
        </DraggableOverlay>
      ))}

      {/* Text overlays */}
      {textOverlays.map((t) =>
        t.text.trim().length === 0 ? null : (
          <DraggableOverlay
            key={t.id}
            id={t.id}
            kind="text"
            bounds={canvasRect}
            containerHeight={height}
            position={t.position}
            scale={t.scale}
            rotation={0}
            allowRotate={false}
            isSelected={t.id === selectedOverlayId}
            onSelect={() => onOverlaySelect(t.id)}
            onTap={() => onTextEdit(t.id)}
            onCommit={(pos, scale) => onTextChange(t.id, { position: pos, scale })}
            onRemove={() => onRemoveOverlay(t.id, 'text')}
            onDraggingChange={setAnyDragging}
          >
            <View
              // collapsable=false keeps the view in the native hierarchy on
              // Android so it can be snapshotted for export rasterization.
              collapsable={false}
              ref={(r) => registerTextView?.(t.id, r)}
              style={{
                maxWidth: canvasRect.width * 0.85,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: t.backgroundColor ?? 'transparent',
              }}
            >
              <Text
                style={{
                  fontSize: t.fontSize,
                  // Matches the text editor's own lineHeight (see
                  // text-entry-overlay.tsx) so the committed overlay's glyph
                  // box is identical to what was typed — otherwise the two
                  // views could clip/space lines differently at the same
                  // fontSize, and this view is also what export snapshots.
                  lineHeight: t.fontSize * 1.25,
                  color: t.color,
                  fontFamily: t.font === 'System' ? undefined : t.font,
                  textAlign: t.alignment,
                }}
              >
                {t.text}
              </Text>
            </View>
          </DraggableOverlay>
        )
      )}

      {/* Drag-to-delete zone (IG-style) */}
      {anyDragging && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: 24,
            alignSelf: 'center',
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: 'rgba(0,0,0,0.55)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.7)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="trash-outline" size={22} color="#FFF" />
        </View>
      )}
    </View>
  );
}

// --- Generic draggable/pinchable/rotatable overlay ---

function DraggableOverlay({
  bounds,
  containerHeight,
  position,
  scale,
  rotation,
  allowRotate,
  isSelected,
  onSelect,
  onTap,
  onCommit,
  onRemove,
  onDraggingChange,
  children,
}: {
  id: string;
  kind: 'text' | 'sticker';
  /** The 9:16 story canvas — positions normalize against this rect. */
  bounds: { x: number; y: number; width: number; height: number };
  /** Full screen height, for the trash-drop zone at the bottom. */
  containerHeight: number;
  position: { x: number; y: number };
  scale: number;
  rotation: number;
  allowRotate: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onTap: () => void;
  onCommit: (
    position: { x: number; y: number },
    scale: number,
    rotation: number
  ) => void;
  onRemove: () => void;
  onDraggingChange: (dragging: boolean) => void;
  children: React.ReactNode;
}) {
  // Center position in container px
  const cx = useSharedValue(bounds.x + position.x * bounds.width);
  const cy = useSharedValue(bounds.y + position.y * bounds.height);
  const sc = useSharedValue(scale);
  const rot = useSharedValue(rotation);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startRot = useSharedValue(0);
  const dragging = useSharedValue(false);

  // Snap guides: -1 hidden, else px
  const snapX = useSharedValue(-1);
  const snapY = useSharedValue(-1);

  const isDraggingRef = useRef(false);
  useEffect(() => {
    if (isDraggingRef.current) return;
    cx.value = bounds.x + position.x * bounds.width;
    cy.value = bounds.y + position.y * bounds.height;
    sc.value = scale;
    rot.value = rotation;
  }, [position.x, position.y, scale, rotation, bounds]);

  const setDragging = (d: boolean) => {
    isDraggingRef.current = d;
    onDraggingChange(d);
  };

  const commit = (x: number, y: number, s: number, r: number) => {
    setDragging(false);
    // Dropped on the trash zone → delete
    if (y > containerHeight - TRASH_ZONE_HEIGHT) {
      onRemove();
      return;
    }
    onCommit(
      {
        x: clamp01((x - bounds.x) / bounds.width),
        y: clamp01((y - bounds.y) / bounds.height),
      },
      s,
      r
    );
  };

  const SNAP = 10;
  const pan = Gesture.Pan()
    .onStart(() => {
      startX.value = cx.value;
      startY.value = cy.value;
      dragging.value = true;
      runOnJS(setDragging)(true);
      runOnJS(onSelect)();
    })
    .onUpdate((e) => {
      const rawX = startX.value + e.translationX;
      const rawY = startY.value + e.translationY;
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      let fx = rawX;
      let fy = rawY;
      snapX.value = -1;
      snapY.value = -1;
      if (Math.abs(rawX - centerX) < SNAP) {
        fx = centerX;
        snapX.value = centerX;
      }
      if (Math.abs(rawY - centerY) < SNAP) {
        fy = centerY;
        snapY.value = centerY;
      }
      cx.value = fx;
      cy.value = fy;
    })
    .onEnd(() => {
      dragging.value = false;
      snapX.value = -1;
      snapY.value = -1;
      runOnJS(commit)(cx.value, cy.value, sc.value, rot.value);
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = sc.value;
    })
    .onUpdate((e) => {
      sc.value = Math.max(0.3, Math.min(startScale.value * e.scale, 6));
    })
    .onEnd(() => {
      runOnJS(commit)(cx.value, cy.value, sc.value, rot.value);
    });

  const rotate = Gesture.Rotation()
    .onStart(() => {
      startRot.value = rot.value;
    })
    .onUpdate((e) => {
      rot.value = startRot.value + (e.rotation * 180) / Math.PI;
    })
    .onEnd(() => {
      runOnJS(commit)(cx.value, cy.value, sc.value, rot.value);
    });

  const tap = Gesture.Tap()
    .maxDuration(250)
    .onEnd(() => {
      runOnJS(onTap)();
    });

  const composed = allowRotate
    ? Gesture.Race(tap, Gesture.Simultaneous(pan, pinch, rotate))
    : Gesture.Race(tap, Gesture.Simultaneous(pan, pinch));

  // Measured half-extents so (cx, cy) anchors the box's visual center.
  const halfW = useSharedValue(50);
  const halfH = useSharedValue(25);

  const style = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: 0,
    top: 0,
    transform: [
      { translateX: cx.value - halfW.value },
      { translateY: cy.value - halfH.value },
      { scale: sc.value },
      { rotate: `${rot.value}deg` },
    ],
    opacity: dragging.value && cy.value > containerHeight - TRASH_ZONE_HEIGHT ? 0.4 : 1,
  }));

  const snapVStyle = useAnimatedStyle(() => ({
    opacity: snapX.value >= 0 ? 1 : 0,
    transform: [{ translateX: snapX.value >= 0 ? snapX.value : 0 }],
  }));
  const snapHStyle = useAnimatedStyle(() => ({
    opacity: snapY.value >= 0 ? 1 : 0,
    transform: [{ translateY: snapY.value >= 0 ? snapY.value : 0 }],
  }));

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', top: 0, bottom: 0, left: 0, width: 1, backgroundColor: '#FFD60A' },
          snapVStyle,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', left: 0, right: 0, top: 0, height: 1, backgroundColor: '#FFD60A' },
          snapHStyle,
        ]}
      />
      <GestureDetector gesture={composed}>
        <Animated.View
          onLayout={(e) => {
            halfW.value = e.nativeEvent.layout.width / 2;
            halfH.value = e.nativeEvent.layout.height / 2;
          }}
          style={[
            style,
            isSelected && {
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.6)',
              borderStyle: 'dashed' as const,
              borderRadius: 8,
            },
          ]}
        >
          {children}
        </Animated.View>
      </GestureDetector>
    </>
  );
}
