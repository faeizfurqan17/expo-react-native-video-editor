import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  const pickVideo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 1,
      videoMaxDuration: 300, // 5 min max
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedVideo(result.assets[0].uri);
      router.push({
        pathname: '/editor',
        params: { videoUri: result.assets[0].uri },
      });
    }
  };

  const recordVideo = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Please allow camera access.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      quality: 1,
      videoMaxDuration: 60,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedVideo(result.assets[0].uri);
      router.push({
        pathname: '/editor',
        params: { videoUri: result.assets[0].uri },
      });
    }
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: '#000' }}
      contentContainerStyle={{ padding: 20, gap: 24, alignItems: 'center', justifyContent: 'center', minHeight: '100%' }}
    >
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Text style={{ color: '#FFF', fontSize: 28, fontWeight: '700' }}>
          Video Editor
        </Text>
        <Text style={{ color: '#999', fontSize: 14, textAlign: 'center' }}>
          Open-source React Native video editor{'\n'}with filters, effects, text & stickers
        </Text>
      </View>

      <View style={{ gap: 12, width: '100%', maxWidth: 320 }}>
        <Pressable
          onPress={pickVideo}
          style={{
            paddingVertical: 16,
            borderRadius: 14,
            backgroundColor: '#007AFF',
            alignItems: 'center',
            borderCurve: 'continuous',
          }}
        >
          <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '600' }}>
            Pick from Gallery
          </Text>
        </Pressable>

        <Pressable
          onPress={recordVideo}
          style={{
            paddingVertical: 16,
            borderRadius: 14,
            backgroundColor: '#333',
            alignItems: 'center',
            borderCurve: 'continuous',
          }}
        >
          <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '600' }}>
            Record Video
          </Text>
        </Pressable>
      </View>

      {/* Features list */}
      <View style={{ gap: 8, width: '100%', maxWidth: 320 }}>
        <Text style={{ color: '#666', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
          Features
        </Text>
        {[
          'Split, Speed, Volume, Crop, Rotate, Delete',
          'Add Audio & Voiceover',
          'Text with Font, Color, Alignment, Highlight',
          'Filters: Norway, Neon, Retro, B&W & more',
          'Effects: Zoom, Glitch, VHS, Soul, Flash',
          'Sticker Overlays with Drag & Resize',
        ].map((feature, i) => (
          <Text key={i} style={{ color: '#999', fontSize: 13 }}>
            {feature}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}
