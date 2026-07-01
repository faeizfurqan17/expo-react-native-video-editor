import React from 'react';
import { View, Text } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { VideoEditor, type ExportResult } from '@anthropic/react-native-video-editor';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EditorScreen() {
  const router = useRouter();
  const { videoUri } = useLocalSearchParams<{ videoUri: string }>();

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
        onExportComplete={handleExportComplete}
        onExportProgress={(progress) => {
          console.log(`Export progress: ${Math.round(progress * 100)}%`);
        }}
        onCancel={handleCancel}
        config={{
          features: {
            trim: true,
            split: true,
            speed: true,
            volume: true,
            crop: true,
            rotate: true,
            audio: true,
            voiceover: true,
            text: true,
            filters: true,
            effects: true,
            stickers: true,
          },
          export: {
            quality: 'high',
            format: 'mp4',
          },
        }}
      />
    </View>
  );
}
