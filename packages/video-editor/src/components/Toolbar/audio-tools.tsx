import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import type { AudioTrack } from '../../core/types';

interface AudioToolsProps {
  audioTracks: AudioTrack[];
  originalVolume: number;
  onAddAudio: () => void;
  onStartVoiceover: () => void;
  onRemoveAudio: (id: string) => void;
  onVolumeChange: (volume: number) => void;
  onTrackVolumeChange: (id: string, volume: number) => void;
}

export function AudioTools({
  audioTracks,
  originalVolume,
  onAddAudio,
  onStartVoiceover,
  onRemoveAudio,
  onVolumeChange,
  onTrackVolumeChange,
}: AudioToolsProps) {
  return (
    <View style={{ gap: 12 }}>
      {/* Add buttons */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={onAddAudio}
          style={{
            flex: 1,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: '#333',
            alignItems: 'center',
            borderCurve: 'continuous',
          }}
        >
          <Ionicons name="musical-notes-outline" size={14} color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: 10 }}>Add Music</Text>
        </Pressable>
        <Pressable
          onPress={onStartVoiceover}
          style={{
            flex: 1,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: '#333',
            alignItems: 'center',
            borderCurve: 'continuous',
          }}
        >
          <Ionicons name="mic-outline" size={14} color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: 10 }}>Voiceover</Text>
        </Pressable>
      </View>

      {/* Original volume */}
      <View style={{ gap: 4 }}>
        <Text style={{ color: '#999', fontSize: 12 }}>Video Volume</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Slider
            style={{ flex: 1, height: 32 }}
            value={originalVolume}
            minimumValue={0}
            maximumValue={2}
            step={0.05}
            onValueChange={onVolumeChange}
            minimumTrackTintColor="#007AFF"
            maximumTrackTintColor="#555"
            thumbTintColor="#FFF"
          />
          <Text style={{ color: '#999', fontSize: 12, width: 40, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
            {Math.round(originalVolume * 100)}%
          </Text>
        </View>
      </View>

      {/* Audio tracks */}
      {audioTracks.map((track) => (
        <View
          key={track.id}
          style={{
            backgroundColor: '#2a2a2a',
            borderRadius: 10,
            padding: 10,
            gap: 6,
            borderCurve: 'continuous',
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: '#FFF', fontSize: 12 }}>
              {track.type === 'voiceover' ? 'Voiceover' : 'Music'}
            </Text>
            <Pressable onPress={() => onRemoveAudio(track.id)}>
              <Text style={{ color: '#FF3B30', fontSize: 12, fontWeight: '600' }}>Remove</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Slider
              style={{ flex: 1, height: 28 }}
              value={track.volume}
              minimumValue={0}
              maximumValue={2}
              step={0.05}
              onValueChange={(v) => onTrackVolumeChange(track.id, v)}
              minimumTrackTintColor="#007AFF"
              maximumTrackTintColor="#555"
              thumbTintColor="#FFF"
            />
            <Text style={{ color: '#999', fontSize: 11, width: 36, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
              {Math.round(track.volume * 100)}%
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
