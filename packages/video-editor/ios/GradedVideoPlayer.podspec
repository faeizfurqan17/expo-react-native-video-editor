require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'GradedVideoPlayer'
  s.version        = package['version']
  s.summary        = 'Native AVPlayer wrapper applying CIColorMatrix grading via AVVideoComposition.'
  s.description    = 'Standalone AVPlayer-backed video view for @faeizfurqan/expo-story-video-and-image-editor. Applies color-matrix grading inside AVFoundation\'s own decode/composite pipeline instead of a GPU readback path. Does not modify or depend on expo-video internals.'
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.4'
  s.source         = { git: package.dig('repository', 'url') || package['homepage'] }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
