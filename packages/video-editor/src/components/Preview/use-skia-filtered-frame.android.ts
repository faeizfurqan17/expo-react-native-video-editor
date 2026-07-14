// Android previously had its own implementation here (createVideoPlayer +
// a hand-rolled decode loop, to avoid useVideo's forced GPU→CPU readback and
// an EGL-context race — see use-skia-filtered-frame.shared.ts for the full
// history). iOS has now moved to the SAME implementation (see the .ios.ts
// sibling) so both platforms can pass an explicit decode `resolution` — the
// stock @shopify/react-native-skia useVideo has no such option and decoding
// a high-res source (e.g. a 1170x2532 screen recording) at full resolution
// spiked memory to ~2GB and crashed on iOS. This file now just re-exports
// the shared implementation; nothing about Android's decode path changed.
export * from './use-skia-filtered-frame.shared';
