import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions, Alert, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Setting isImporting/selectedVideo and navigating in the same tick can get
  // batched into a single React commit, so the "Importing video..." overlay
  // never actually paints before the screen transitions away. One frame is
  // enough for it to render — no need for the arbitrary 500ms/1000ms delays
  // this previously used, which just taxed every import unconditionally.
  const navigateToEditor = (uri: string, sourceType: 'video' | 'image' = 'video') => {
    requestAnimationFrame(() => {
      router.push({ pathname: '/editor', params: { videoUri: uri, sourceType } });
      setIsImporting(false);
    });
  };

  const pickVideo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Please allow access to your photo library.');
      return;
    }

    const pickStart = Date.now();
    console.log('[import] pickVideo: launchImageLibraryAsync starting');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: false, // ensures we don't trigger OS edit/crop UI
      videoMaxDuration: 300, // 5 min max
      // videoExportPreset/preferredAssetRepresentationMode are iOS-only
      // (PHPickerConfiguration/UIImagePickerController concepts) — Android's
      // picker has no such native option and expo-image-picker just ignores
      // them there, but keep them iOS-gated so it's clear this fix is scoped
      // to the platform that actually had the slow-import problem.
      ...(Platform.OS === 'ios' && {
        videoExportPreset: ImagePicker.VideoExportPreset.Passthrough, // stops OS transcode after the asset is obtained
        // Without this, PHPickerViewController defaults to .automatic, which can
        // let the system choose (and prepare/convert) a representation before
        // handing the file over at all — independent of videoExportPreset,
        // which only governs what happens AFTER that. .current requests the
        // asset's exact on-disk bytes with no system-side conversion, which is
        // what actually fixed a 14s copy-out delay for a 54MB/54s 1080p clip.
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      }),
    });
    console.log(`[import] pickVideo: launchImageLibraryAsync took ${Date.now() - pickStart}ms`);

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      console.log(
        '[import] picked asset:',
        JSON.stringify({
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          width: asset.width,
          height: asset.height,
          duration: asset.duration,
        })
      );
      setIsImporting(true);
      setSelectedVideo(asset.uri);
      navigateToEditor(asset.uri);
    }
  };

  const recordVideo = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Please allow camera access.');
      return;
    }

    const recordStart = Date.now();
    console.log('[import] recordVideo: launchCameraAsync starting');
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      quality: 1,
      videoMaxDuration: 60,
      // iOS-only — see pickVideo's comment. Without this, iOS may run its
      // own export/transcode pass on the freshly captured clip before
      // handing it back; Android has no equivalent option to gate here.
      ...(Platform.OS === 'ios' && {
        videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
      }),
    });
    console.log(`[import] recordVideo: launchCameraAsync took ${Date.now() - recordStart}ms`);

    if (!result.canceled && result.assets[0]) {
      setIsImporting(true);
      setSelectedVideo(result.assets[0].uri);
      navigateToEditor(result.assets[0].uri);
    }
  };

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      // iOS-only — see pickVideo's comment for why.
      ...(Platform.OS === 'ios' && {
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      }),
    });

    if (!result.canceled && result.assets[0]) {
      setIsImporting(true);
      setSelectedVideo(result.assets[0].uri);
      navigateToEditor(result.assets[0].uri, 'image');
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

        <Pressable
          onPress={pickPhoto}
          style={{
            paddingVertical: 16,
            borderRadius: 14,
            backgroundColor: '#333',
            alignItems: 'center',
            borderCurve: 'continuous',
          }}
        >
          <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '600' }}>
            Pick a Photo
          </Text>
        </Pressable>
      </View>

      {isImporting && (
        <View
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            zIndex: 100,
          }}
        >
          <ActivityIndicator size="large" color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '600' }}>
            Importing video...
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
