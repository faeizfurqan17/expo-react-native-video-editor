import React from 'react';
import { View, Text } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { VideoEditor, type ExportResult, type SourceType } from '@faeizfurqan/expo-story-video-and-image-editor';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EditorScreen() {
  const router = useRouter();
  const { videoUri, sourceType } = useLocalSearchParams<{
    videoUri: string;
    sourceType?: SourceType;
  }>();
  // expo-router's native stack keeps this screen mounted in the background
  // after pushing /preview on export complete — without this, the editor's
  // live video decoder keeps running off-screen indefinitely.
  const isFocused = useIsFocused();

  if (!videoUri) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#FF3B30', fontSize: 16 }}>No video selected</Text>
      </SafeAreaView>
    );
  }

  const handleExportComplete = (result: ExportResult) => {
    router.push({
      pathname: '/preview',
      params: {
        uri: result.uri,
        duration: String(result.duration),
        size: String(result.size),
        width: String(result.width),
        height: String(result.height),
      },
    });
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <VideoEditor
        source={videoUri}
        sourceType={sourceType ?? 'video'}
        isActive={isFocused}
        onExportComplete={handleExportComplete}
        onExportProgress={(progress) => {
          console.log(`Export progress: ${Math.round(progress * 100)}%`);
        }}
        onCancel={handleCancel}
        config={{
          features: {
            text: true,
            filters: true,
            stickers: true,
            music: true,
          },
          // Set EXPO_PUBLIC_GIPHY_API_KEY in example/.env (see .env.example).
          giphyApiKey: process.env.EXPO_PUBLIC_GIPHY_API_KEY,
          export: {
            quality: 'high',
            format: 'mp4',
          },
        }}
      />
    </View>
  );
}
