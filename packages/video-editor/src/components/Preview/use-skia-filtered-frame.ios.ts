// iOS previously used @shopify/react-native-skia's stock useVideo directly —
// see use-skia-filtered-frame.shared.ts for why that changed: useVideo always
// decodes at the source's full native resolution with no way to cap it, and
// a high-res portrait source (e.g. a 1170x2532 screen recording) made it
// allocate decode buffers/textures for the whole frame the instant a filter
// was first applied, spiking memory to ~2GB and crashing. The shared
// implementation (already proven on Android) takes an explicit target
// `resolution`, so the decoder itself scales down during decode — a real
// hardware-level downscale, not a blurry post-decode resize.
export * from './use-skia-filtered-frame.shared';
