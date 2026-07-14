import AVFoundation
import ExpoModulesCore

/// Standalone AVPlayer-backed preview surface. Deliberately independent of
/// expo-video — it owns its own AVPlayer/AVPlayerItem/AVPlayerLayer so this
/// module has no coupling to expo-video's internal API surface (which is
/// `internal` and unversioned), making it safe to publish as a library
/// dependency without pinning to an exact expo-video release.
///
/// Color grading is applied via AVMutableVideoComposition wrapping a
/// CIColorMatrix filter, so it runs inside AVFoundation's own
/// decode/tone-map/composite pipeline rather than a separate Skia/Metal
/// readback path — the whole point of this module.
public class GradedVideoPlayerView: ExpoView {
  private let player = AVPlayer()
  private let playerLayer: AVPlayerLayer

  // Read live by the AVMutableVideoComposition's handler block on every
  // frame — swapping filters only ever mutates this box, never reassigns
  // item.videoComposition itself. Reassigning videoComposition on an
  // AVPlayerItem that's already playing is a documented AVFoundation
  // pitfall: it forces the player to reconfigure its render pipeline
  // mid-playback, which stalls/freezes playback (confirmed empirically —
  // the first filter applied after load worked, but every subsequent filter
  // switch froze the video, matching exactly this "live composition swap"
  // failure mode rather than a one-time mount race).
  private final class ColorMatrixBox {
    var matrix: [Float]?
  }
  private let colorMatrixBox = ColorMatrixBox()
  private var compositionInstalled = false
  private var looping = false
  private var endObserver: NSObjectProtocol?
  // Expo's Prop DSL re-invokes every registered Prop setter on each props
  // commit that includes it, regardless of whether the value actually
  // changed (unlike a Swift `didSet`, which only fires on real changes) — so
  // without this guard, every filter switch (which re-sends ALL props,
  // including the unchanged `source`) was recreating the AVPlayerItem from
  // scratch, tearing down whatever the color-matrix fix above had just
  // stabilized.
  private var currentSourceUri: String?

  public required init(appContext: AppContext? = nil) {
    playerLayer = AVPlayerLayer(player: player)
    super.init(appContext: appContext)
    playerLayer.videoGravity = .resizeAspect
    layer.addSublayer(playerLayer)
  }

  deinit {
    if let endObserver {
      NotificationCenter.default.removeObserver(endObserver)
    }
  }

  // Under Fabric (ExpoView == ExpoFabricView), plain UIKit layoutSubviews()
  // is not a reliable hook for size changes — mirroring expo-image's
  // ImageView, which reacts via the `bounds` property setter instead.
  public override var bounds: CGRect {
    didSet {
      playerLayer.frame = bounds
    }
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    playerLayer.frame = bounds
  }

  func setSource(_ uri: String?) {
    guard uri != currentSourceUri else { return }
    currentSourceUri = uri
    if let endObserver {
      NotificationCenter.default.removeObserver(endObserver)
      self.endObserver = nil
    }
    // `uri` from expo-image-picker etc. is normally a well-formed `file://`
    // URL string, but tolerate a bare filesystem path too rather than
    // silently dropping the source.
    let url: URL? = uri.flatMap { value in
      if let parsed = URL(string: value), parsed.scheme != nil {
        return parsed
      }
      return URL(fileURLWithPath: value)
    }
    guard let url else {
      player.replaceCurrentItem(with: nil)
      return
    }
    let item = AVPlayerItem(url: url)
    player.replaceCurrentItem(with: item)
    // A new item never carries over the previous item's composition, so this
    // must be reinstalled once per item — but only ever installed once per
    // item; later filter changes mutate colorMatrixBox instead (see below).
    compositionInstalled = false
    applyColorMatrix()

    endObserver = NotificationCenter.default.addObserver(
      forName: .AVPlayerItemDidPlayToEndTime,
      object: item,
      queue: .main
    ) { [weak self] _ in
      guard let self, self.looping else { return }
      self.player.seek(to: .zero)
      self.player.play()
    }
  }

  func setLoop(_ loop: Bool) {
    looping = loop
  }

  func setMuted(_ muted: Bool) {
    player.isMuted = muted
  }

  func setVolume(_ volume: Float) {
    player.volume = volume
  }

  func play() {
    player.play()
  }

  func pause() {
    player.pause()
  }

  func seek(to seconds: Double) {
    player.seek(to: CMTime(seconds: seconds, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
  }

  /// 20-element row-major 4x5 CIColorMatrix (R,G,B,A,Bias rows). Pass nil or
  /// an empty array to remove grading. Never reassigns item.videoComposition
  /// after the first install (see ColorMatrixBox comment) — just updates the
  /// values the already-installed composition's handler reads live.
  func setColorMatrix(_ matrix: [Float]?) {
    colorMatrixBox.matrix = (matrix?.count == 20) ? matrix : nil
    applyColorMatrix()
  }

  private func applyColorMatrix() {
    guard let item = player.currentItem else { return }
    guard !compositionInstalled else { return }
    compositionInstalled = true

    let box = colorMatrixBox
    item.videoComposition = AVMutableVideoComposition(asset: item.asset) { request in
      guard let matrix = box.matrix, matrix.count == 20 else {
        request.finish(with: request.sourceImage, context: nil)
        return
      }
      let rVector = CIVector(x: CGFloat(matrix[0]), y: CGFloat(matrix[1]), z: CGFloat(matrix[2]), w: CGFloat(matrix[3]))
      let gVector = CIVector(x: CGFloat(matrix[5]), y: CGFloat(matrix[6]), z: CGFloat(matrix[7]), w: CGFloat(matrix[8]))
      let bVector = CIVector(x: CGFloat(matrix[10]), y: CGFloat(matrix[11]), z: CGFloat(matrix[12]), w: CGFloat(matrix[13]))
      let aVector = CIVector(x: CGFloat(matrix[15]), y: CGFloat(matrix[16]), z: CGFloat(matrix[17]), w: CGFloat(matrix[18]))
      let biasVector = CIVector(x: CGFloat(matrix[4]), y: CGFloat(matrix[9]), z: CGFloat(matrix[14]), w: CGFloat(matrix[19]))

      let filter = CIFilter(name: "CIColorMatrix")!
      filter.setValue(request.sourceImage.clampedToExtent(), forKey: kCIInputImageKey)
      filter.setValue(rVector, forKey: "inputRVector")
      filter.setValue(gVector, forKey: "inputGVector")
      filter.setValue(bVector, forKey: "inputBVector")
      filter.setValue(aVector, forKey: "inputAVector")
      filter.setValue(biasVector, forKey: "inputBiasVector")
      let output = filter.outputImage?.cropped(to: request.sourceImage.extent) ?? request.sourceImage
      request.finish(with: output, context: nil)
    }
  }
}
