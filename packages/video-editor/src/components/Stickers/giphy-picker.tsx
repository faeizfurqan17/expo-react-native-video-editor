import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

interface GiphyGif {
  id: string;
  images: {
    fixed_width: { url: string; width: string; height: string };
  };
}

export interface PickedSticker {
  uri: string;
  width: number;
  height: number;
  animated: boolean;
}

interface GiphyPickerProps {
  apiKey?: string;
  onPick: (sticker: PickedSticker) => void;
  onClose: () => void;
}

/**
 * Bottom-sheet Giphy sticker picker: trending grid + search.
 * Without an API key it falls back to the photo library (static images).
 * Selected GIFs are downloaded to cache so preview and FFmpeg read local files.
 */
export function GiphyPicker({ apiKey, onPick, onClose }: GiphyPickerProps) {
  const { height: screenHeight } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchGifs = useCallback(
    async (searchQuery: string) => {
      if (!apiKey) return;
      setLoading(true);
      setError(null);
      try {
        const endpoint = searchQuery.trim()
          ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(searchQuery.trim())}&limit=30&rating=pg-13`
          : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=30&rating=pg-13`;
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error(`Giphy ${res.status}`);
        const json = await res.json();
        setGifs(json.data ?? []);
      } catch {
        setError('Could not load stickers. Check your connection.');
        setGifs([]);
      } finally {
        setLoading(false);
      }
    },
    [apiKey]
  );

  useEffect(() => {
    fetchGifs('');
  }, [fetchGifs]);

  const handleSearch = (text: string) => {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchGifs(text), 400);
  };

  const handleSelect = async (gif: GiphyGif) => {
    if (downloading) return;
    setDownloading(gif.id);
    try {
      // fixed_width (Giphy's ~200-500px-wide rendition), not original — the
      // full-size original can be several MB/several times larger in pixel
      // dimensions, and export re-decodes this file for the whole video's
      // duration (-stream_loop -1), so a smaller source file directly cuts
      // both download size and FFmpeg's per-frame GIF decode cost. Stickers
      // are composited small on the story canvas anyway (see overlayImage's
      // own downscale), so there's no visible quality loss.
      const dest = `${FileSystem.cacheDirectory}giphy_${gif.id}.gif`;
      const info = await FileSystem.getInfoAsync(dest);
      if (!info.exists) {
        await FileSystem.downloadAsync(gif.images.fixed_width.url, dest);
      }
      onPick({
        uri: dest,
        width: parseInt(gif.images.fixed_width.width, 10) || 200,
        height: parseInt(gif.images.fixed_width.height, 10) || 200,
        animated: true,
      });
    } catch {
      setError('Download failed — try another sticker.');
    } finally {
      setDownloading(null);
    }
  };

  // No API key → photo library fallback (static image stickers).
  const handleGalleryFallback = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      onPick({
        uri: a.uri,
        width: a.width || 200,
        height: a.height || 200,
        animated: false,
      });
    } catch {
      // Picker dismissed/unavailable — stay open.
    }
  };

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: screenHeight * 0.62,
        backgroundColor: '#1C1C1E',
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        paddingTop: 10,
      }}
    >
      {/* Grabber + close */}
      <View style={{ alignItems: 'center', marginBottom: 6 }}>
        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#48484A' }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8 }}>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#2C2C2E',
            borderRadius: 10,
            paddingHorizontal: 10,
            height: 38,
            gap: 6,
          }}
        >
          <Ionicons name="search" size={15} color="#8E8E93" />
          <TextInput
            value={query}
            onChangeText={handleSearch}
            placeholder="Search GIPHY"
            placeholderTextColor="#8E8E93"
            style={{ flex: 1, color: '#FFF', fontSize: 14 }}
            editable={!!apiKey}
          />
        </View>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '600' }}>Close</Text>
        </Pressable>
      </View>

      {!apiKey ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
          <Text style={{ color: '#8E8E93', fontSize: 13, textAlign: 'center' }}>
            No GIPHY key configured — pick a sticker image from your library instead.
          </Text>
          <Pressable
            onPress={handleGalleryFallback}
            style={{
              paddingHorizontal: 22,
              paddingVertical: 11,
              backgroundColor: '#007AFF',
              borderRadius: 20,
            }}
          >
            <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 14 }}>Open Photos</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#8E8E93" />
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: '#8E8E93', fontSize: 13, textAlign: 'center' }}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={gifs}
          keyExtractor={(g) => g.id}
          numColumns={3}
          style={{ marginTop: 10 }}
          contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={{ color: '#8E8E93', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
              No results for “{query.trim()}”
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handleSelect(item)}
              style={{ flex: 1 / 3, aspectRatio: 1, padding: 4, opacity: downloading === item.id ? 0.4 : 1 }}
            >
              <Image
                source={{ uri: item.images.fixed_width.url }}
                style={{ flex: 1, borderRadius: 8, backgroundColor: '#2C2C2E' }}
                contentFit="cover"
              />
              {downloading === item.id && (
                <ActivityIndicator
                  style={{ position: 'absolute', alignSelf: 'center', top: '40%' }}
                  color="#FFF"
                />
              )}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
