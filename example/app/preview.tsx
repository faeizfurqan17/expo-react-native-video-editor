import React from 'react';
import { View, Text, Pressable, Share } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PreviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { uri, duration, size, width, height } = useLocalSearchParams<{
    uri: string;
    duration: string;
    size: string;
    width: string;
    height: string;
  }>();

  const player = useVideoPlayer(uri ?? '', (p) => {
    p.loop = true;
    p.play();
  });

  if (!uri) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#FF3B30', fontSize: 16 }}>No video to preview</Text>
      </View>
    );
  }

  const durationNum = parseFloat(duration ?? '0');
  const sizeNum = parseInt(size ?? '0', 10);
  const widthNum = parseInt(width ?? '0', 10);
  const heightNum = parseInt(height ?? '0', 10);

  const handleShare = async () => {
    try {
      await Share.share({ url: uri });
    } catch {
      // User cancelled
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingTop: insets.top + 8,
          paddingBottom: 8,
        }}
      >
        <Pressable onPress={() => router.dismissAll()}>
          <Text style={{ color: '#007AFF', fontSize: 16 }}>Done</Text>
        </Pressable>
        <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '600' }}>Export Preview</Text>
        <Pressable onPress={handleShare}>
          <Text style={{ color: '#007AFF', fontSize: 16 }}>Share</Text>
        </Pressable>
      </View>

      {/* Video Player */}
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <VideoView
          player={player}
          style={{ width: '100%', aspectRatio: widthNum && heightNum ? widthNum / heightNum : 9 / 16 }}
          contentFit="contain"
          nativeControls
        />
      </View>

      {/* Info */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 16,
          paddingTop: 12,
          gap: 8,
        }}
      >
        <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '600' }}>Export Complete</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          {durationNum > 0 && (
            <InfoChip label="Duration" value={`${durationNum.toFixed(1)}s`} />
          )}
          {sizeNum > 0 && (
            <InfoChip label="Size" value={`${(sizeNum / 1024 / 1024).toFixed(1)} MB`} />
          )}
          {widthNum > 0 && heightNum > 0 && (
            <InfoChip label="Resolution" value={`${widthNum}x${heightNum}`} />
          )}
        </View>
      </View>
    </View>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ backgroundColor: '#1C1C1E', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
      <Text style={{ color: '#999', fontSize: 11, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '500', marginTop: 2 }}>{value}</Text>
    </View>
  );
}
