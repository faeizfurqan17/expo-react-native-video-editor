const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Expo config plugin to add ffmpeg-kit-react-native pod with the correct subspec.
 * Must be defined BEFORE use_native_modules! in the Podfile.
 */
function withFFmpegKit(config, { package: packageName = "https" } = {}) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );
      let podfile = fs.readFileSync(podfilePath, "utf8");

      // Map subspecs to their luthviar mirror podspec URLs (arthenica releases are dead)
      const LUTHVIAR_PODSPECS = {
        full: "https://raw.githubusercontent.com/luthviar/ffmpeg-kit-ios-full/main/ffmpeg-kit-ios-full.podspec",
      };

      // Add ffmpeg-kit pod before use_native_modules!
      const mirrorPodspec = LUTHVIAR_PODSPECS[packageName];
      const mirrorLine = mirrorPodspec
        ? `  # Use luthviar's mirror since arthenica's releases are gone (404)\n  pod 'ffmpeg-kit-ios-${packageName}', :podspec => '${mirrorPodspec}'\n`
        : "";
      const podLine = `  pod 'ffmpeg-kit-react-native', :subspecs => ['${packageName}'], :podspec => '../../node_modules/ffmpreg-kit-react-native/ffmpeg-kit-react-native.podspec'\n`;

      // Insert before use_native_modules!
      if (!podfile.includes("ffmpeg-kit-react-native")) {
        podfile = podfile.replace(
          /(\s*config = use_native_modules!)/,
          `\n${mirrorLine}${podLine}\n$1`
        );
      }

      fs.writeFileSync(podfilePath, podfile);
      return config;
    },
  ]);
}

module.exports = withFFmpegKit;
