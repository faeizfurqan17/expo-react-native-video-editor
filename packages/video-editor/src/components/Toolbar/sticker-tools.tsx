import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StickerOverlay } from '../../core/types';

interface StickerToolsProps {
  stickerOverlays: StickerOverlay[];
  currentTime: number;
  duration: number;
  onAddSticker: (uri: string) => void;
  onRemoveSticker: (id: string) => void;
  onPickSticker: () => void;
}

export function StickerTools({
  stickerOverlays,
  onAddSticker,
  onRemoveSticker,
  onPickSticker,
}: StickerToolsProps) {
  return (
    <View style={{ gap: 12 }}>
      {/* Add sticker button */}
      <Pressable
        onPress={onPickSticker}
        style={{
          paddingVertical: 12,
          borderRadius: 12,
          backgroundColor: '#333',
          alignItems: 'center',
          borderCurve: 'continuous',
        }}
      >
        <Ionicons name="happy-outline" size={14} color="#FFF" />
        <Text style={{ color: '#FFF', fontSize: 10 }}>Choose Sticker from Gallery</Text>
      </Pressable>

      {/* Active stickers */}
      {stickerOverlays.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={{ color: '#999', fontSize: 11 }}>Active Stickers:</Text>
          {stickerOverlays.map((sticker, i) => (
            <View
              key={sticker.id}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#2a2a2a',
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 8,
                borderCurve: 'continuous',
              }}
            >
              <Text style={{ color: '#FFF', fontSize: 12 }}>
                Sticker {i + 1} ({sticker.startTime.toFixed(1)}s - {sticker.endTime.toFixed(1)}s)
              </Text>
              <Pressable onPress={() => onRemoveSticker(sticker.id)}>
                <Text style={{ color: '#FF3B30', fontSize: 12, fontWeight: '600' }}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
