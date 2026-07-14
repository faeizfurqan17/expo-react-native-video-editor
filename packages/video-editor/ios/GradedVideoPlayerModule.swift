import ExpoModulesCore

public class GradedVideoPlayerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GradedVideoPlayer")

    View(GradedVideoPlayerView.self) {
      Prop("source") { (view, source: String?) in
        view.setSource(source)
      }

      Prop("loop") { (view, loop: Bool?) in
        view.setLoop(loop ?? false)
      }

      Prop("muted") { (view, muted: Bool?) in
        view.setMuted(muted ?? false)
      }

      Prop("volume") { (view, volume: Double?) in
        view.setVolume(Float(volume ?? 1.0))
      }

      // 20-element row-major 4x5 CIColorMatrix (R,G,B,A,Bias rows), or
      // nil/empty to clear grading.
      Prop("colorMatrix") { (view, matrix: [Float]?) in
        view.setColorMatrix(matrix)
      }

      AsyncFunction("play") { (view: GradedVideoPlayerView) in
        view.play()
      }

      AsyncFunction("pause") { (view: GradedVideoPlayerView) in
        view.pause()
      }

      AsyncFunction("seekTo") { (view: GradedVideoPlayerView, seconds: Double) in
        view.seek(to: seconds)
      }
    }
  }
}
