import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useSharedValue,
  useDerivedValue,
  useAnimatedReaction,
  useFrameCallback,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { Skia, type SkImage } from '@shopify/react-native-skia';
import {
  __RNSkiaVideoPrivateAPI as RNSkiaVideoModule,
  type VideoFrame,
  type VideoPlayer,
} from '@azzapp/react-native-skia-video';

/**
 * Shared iOS + Android backend for the filtered preview decoder, built on
 * @azzapp/react-native-skia-video's low-level createVideoPlayer instead of
 * @shopify/react-native-skia's built-in useVideo.
 *
 * Why not the stock useVideo (either platform): it always decodes the
 * source at its FULL native resolution — there is no resolution option.
 * That's fine for normal camera footage, but a screen recording or similar
 * high-res portrait source (e.g. 1170x2532) makes useVideo allocate decode
 * buffers/textures for the whole frame immediately once a filter is first
 * applied, which spiked to ~2GB and crashed on iOS. createVideoPlayer takes
 * an explicit target `resolution`, so the decoder itself scales down during
 * decode (a real hardware-level downscale, not a blurry post-decode resize)
 * — see the `resolution` option below, sized to the actual on-screen
 * preview rect rather than the source file's raw dimensions.
 *
 * Why not the library's own useVideoPlayer hook: its internal
 * useFrameCallback calls decodeNextFrame() with no error handling. On
 * Android specifically, decodeNextFrame()'s first call lazily binds to
 * whatever EGL context is current on the UI thread — RN Skia's own Canvas
 * creates its EGL context asynchronously, so on a cold start there's a real
 * window where nothing is bound yet and the native call throws ("Skia
 * context is not initialized"), crashing the library's own uncaught frame
 * callback. Calling decodeNextFrame() ourselves lets us wrap it in
 * try/catch and just retry a tick later until Skia's context exists. This
 * EGL race is Android-specific, but the retry/recreate machinery below is
 * harmless on iOS (it just never has a reason to trigger there).
 */

export interface Options {
  paused: SharedValue<boolean>;
  seek: SharedValue<number | null>;
  looping: boolean;
  volume: SharedValue<number>;
  /** Target decode resolution — see the module doc above. Omit/null for the
   * source's native resolution (only safe for small sources). */
  resolution?: { width: number; height: number } | null;
  /** Called when all player recreate attempts are exhausted and the Skia
   * decode path cannot recover. The parent should fall back to native. */
  onBroken?: () => void;
}

export interface Result {
  currentFrame: SharedValue<SkImage | null>;
  currentTime: SharedValue<number>;
  size: { width: number; height: number };
  rotation: number;
}

export function useSkiaFilteredFrame(source: string | null, options: Options): Result {
  const { paused, seek, looping, volume, resolution, onBroken } = options;

  // Bumped to dispose + recreate the player after a decode failure. The
  // library's C++ layer captures the UI thread's current EGL context on the
  // FIRST decodeNextFrame() call of a player's life — once, ever (Android
  // only). If RN Skia's own Canvas hasn't painted yet at that instant (cold
  // start), it captures nothing, native setupGL() throws, and that player
  // instance is permanently bricked (every later call NPEs on the null EGL
  // holder). Retrying on the same instance can never recover; a fresh
  // instance gets a fresh init latch, and by the time it's ready the
  // filter's Canvas has painted, so the context exists and init succeeds.
  const [playerEpoch, setPlayerEpoch] = useState(0);
  const [player, setPlayer] = useState<VideoPlayer | null>(null);
  // Resolution is only read at player-creation time (the native API takes it
  // once, up front) — capture it in a ref so changing display size later
  // doesn't recreate the decoder, only a genuinely new source/epoch does.
  const resolutionRef = useRef(resolution);
  resolutionRef.current = resolution;
  useEffect(() => {
    if (!source) {
      setPlayer(null);
      return;
    }
    const created = RNSkiaVideoModule.createVideoPlayer(source, resolutionRef.current ?? null);
    setPlayer(created);
    created.on('error', (err) => console.warn('[skia-video] player error', err));
    return () => {
      created.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, playerEpoch]);

  // Throttled + capped: recreate failing repeatedly means the device/session
  // genuinely can't do this; call onBroken so the parent can fall back to
  // native playback — don't recreate players in a hot loop forever.
  const recreateAttemptsRef = useRef(0);
  const lastRecreateAtRef = useRef(0);
  const requestPlayerRecreate = useCallback(() => {
    const now = Date.now();
    if (now - lastRecreateAtRef.current < 2000) return;
    if (recreateAttemptsRef.current >= 4) {
      // All attempts exhausted — the Skia decode path is broken for this
      // session/device. Signal the parent to fall back to native playback.
      onBroken?.();
      return;
    }
    recreateAttemptsRef.current += 1;
    lastRecreateAtRef.current = now;
    setPlayerEpoch((e) => e + 1);
  }, [onBroken]);
  useEffect(() => {
    recreateAttemptsRef.current = 0;
    lastRecreateAtRef.current = 0;
  }, [source]);

  const [dimensions, setDimensions] = useState({ width: 0, height: 0, rotation: 0 });
  useEffect(() => {
    if (!player) return;
    return player.on('ready', (dims) => {
      // Android's native player can emit ready before MediaCodec resolves
      // dimensions — ignore the spurious zero-dimension event so
      // skiaFrameSize stays at {0,0} until real dimensions arrive (or
      // never, in which case the null-frame counter below triggers recreate).
      if (!dims.width || !dims.height) return;
      setDimensions(dims);
    });
  }, [player]);

  useEffect(() => {
    if (player) player.isLooping = looping;
  }, [player, looping]);

  // volume is a shared value elsewhere in the preview (matching useVideo's
  // contract); mirror it into a plain setter since the native player field
  // is a normal property, not something a worklet can write directly.
  const applyVolume = useCallback(
    (v: number) => {
      if (player) player.volume = v;
    },
    [player]
  );
  useEffect(() => applyVolume(volume.value), [applyVolume, volume]);
  useAnimatedReaction(
    () => volume.value,
    (v, prev) => {
      if (v !== prev) runOnJS(applyVolume)(v);
    },
    [applyVolume]
  );

  // A plain useRef is NOT safe to read from inside a worklet: the first time
  // Reanimated hands the ref object to a worklet it freezes it as a
  // "shareable" snapshot, and every later plain-JS-thread `.current =`
  // mutation silently fails from then on (see the
  // "Tried to modify key `current` of an object which has been already
  // passed to a worklet" warning). A shared value is explicitly designed for
  // cross-thread read/write, so it replaces a ref here.
  const playerHolder = useSharedValue<VideoPlayer | null>(null);
  useEffect(() => {
    playerHolder.value = player;
  }, [player, playerHolder]);
  const applyPaused = useCallback(
    (isPaused: boolean) => {
      if (isPaused) {
        player?.pause();
      } else {
        player?.play();
      }
    },
    [player]
  );
  useAnimatedReaction(
    () => paused.value,
    (isPaused, prev) => {
      if (isPaused !== prev) runOnJS(applyPaused)(isPaused);
    },
    [applyPaused]
  );
  // The player is created asynchronously after this hook first runs, so the
  // reaction above (which only fires on a CHANGE to paused.value) can miss
  // applying the state that was already current before the player existed.
  // Re-sync explicitly the moment a real player instance shows up.
  useEffect(() => {
    if (player) applyPaused(paused.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, applyPaused]);

  // seek is in ms (matching useVideo's contract); seekTo() takes seconds.
  // JS-thread-only (invoked via runOnJS), so it can read `player` directly.
  const applySeek = useCallback(
    (ms: number) => {
      player?.seekTo(ms / 1000);
    },
    [player]
  );
  useAnimatedReaction(
    () => seek.value,
    (value) => {
      if (value !== null) {
        runOnJS(applySeek)(value);
        seek.value = null;
      }
    },
    [applySeek]
  );

  // useFrameCallback's own effect deps are [callback, autostart] (see the
  // library source) — passing a fresh inline arrow function re-registers the
  // whole frame loop on EVERY render (any state change: paused, dimensions,
  // player, ...). That teardown/re-register race silently kills decode after
  // the first successful frame: applyPaused's runOnJS triggers a render, the
  // callback identity changes, useFrameCallback tears down the old
  // registration and re-registers — and the loop never resumes ticking.
  // useCallback([]) below makes the callback identity permanently stable so
  // the frame loop registers exactly once for this hook's lifetime. `player`
  // (a JSI host object) is threaded through `playerHolder`, a shared value,
  // rather than closed over directly — a stable worklet can't close over a
  // value that changes across renders, so the current player must be read
  // from somewhere both threads can see.
  const rawFrame = useSharedValue<VideoFrame | null>(null);
  // Reset per-attempt counters whenever a new player epoch starts so the
  // fresh player gets a clean window — stale counts from the previous
  // (disposed) player must not bleed into the new one's budget.
  useEffect(() => {
    nullFrameCount.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerEpoch]);
  // How many consecutive null-frames from decodeNextFrame() before we give
  // up and recreate the player. At 60 fps, 120 frames ≈ 2s — matching the
  // recreate throttle window so we don't spin faster than allowed.
  const NULL_FRAME_LIMIT = 120;
  const nullFrameCount = useSharedValue(0);
  const decodeFrameCallback = useCallback(() => {
    'worklet';
    const currentPlayer = playerHolder.value;
    if (!currentPlayer) return;
    // Never decode while paused — decodeNextFrame()'s FIRST call on a player
    // consumes its one-shot EGL init on Android (see the epoch comment
    // above), so it must not run at editor mount (paused, no filter, no
    // Canvas painted yet). It only runs once a filter unpauses this path, by
    // which point the filter's own Canvas is mounting and painting.
    if (paused.value) return;
    try {
      const nextFrame = currentPlayer.decodeNextFrame();
      if (nextFrame) {
        nullFrameCount.value = 0;
        rawFrame.value = nextFrame;
      } else {
        nullFrameCount.value += 1;
        if (nullFrameCount.value >= NULL_FRAME_LIMIT) {
          nullFrameCount.value = 0;
          runOnJS(requestPlayerRecreate)();
        }
      }
    } catch {
      // First decode lost the race against Skia's Canvas painting (no EGL
      // context existed yet, Android-only) — this player instance is now
      // permanently broken (one-shot native init latch), so swap in a fresh one.
      nullFrameCount.value = 0;
      runOnJS(requestPlayerRecreate)();
    }
    // Empty deps: every value the worklet touches is a shared value or a
    // JS-thread function whose own identity is already stabilized with
    // useCallback([]) — so this callback's identity never needs to change,
    // and useFrameCallback's internal effect never re-registers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrameCallback(decodeFrameCallback, true);

  // Zero-copy GPU texture → SkImage, re-derived each decoded frame.
  const currentFrame = useDerivedValue(() => {
    const frame = rawFrame.value;
    if (!frame) return null;
    return Skia.Image.MakeImageFromNativeTextureUnstable(
      frame.texture,
      frame.width,
      frame.height
    ) as SkImage;
  }, [rawFrame]);

  // Defensive: the underlying decoder may recycle the native texture behind
  // a stale SkImage wrapper before GC collects it (the same hazard
  // useVideo's copyFrameOnAndroid guards against). Eagerly dispose the
  // previous wrapper once a new frame has replaced it everywhere it's read.
  // This must be a shared value, not a useRef: worklets capture plain JS
  // objects as UI-runtime copies, so mutating ref.current from a worklet can
  // silently update only the copy — leaking one SkImage per frame.
  const prevImage = useSharedValue<SkImage | null>(null);
  useAnimatedReaction(
    () => currentFrame.value,
    (image, prevValue) => {
      if (image === prevValue) return;
      const stale = prevImage.value;
      prevImage.value = image;
      stale?.dispose();
    },
    []
  );

  // No native clock is exposed by this player; the stall watchdog only
  // needs a value that changes on every fresh decode, so count frames.
  const currentTime = useSharedValue(0);
  useAnimatedReaction(
    () => rawFrame.value,
    (frame, prev) => {
      if (frame !== prev) currentTime.value += 1;
    },
    []
  );

  const size = useMemo(
    () => ({ width: dimensions.width, height: dimensions.height }),
    [dimensions.width, dimensions.height]
  );

  return { currentFrame, currentTime, size, rotation: dimensions.rotation };
}
