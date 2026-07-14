import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AudioTrack } from '../../core/types';
import { MusicTrimSelector } from './music-trim-selector';

interface MusicSheetProps {
  track: AudioTrack | null;
  /** The video's own duration — the trim window is always exactly this
   * long, since that's how much of the track can actually play (matches
   * ffmpeg-command-builder's -shortest clamp). */
  videoDuration: number;
  onPickFile: () => void;
  onTrimChange: (trimStart: number) => void;
  onRemove: () => void;
  onClose: () => void;
}

/**
 * IG-style music panel: pick one background track, choose which window of
 * it plays (drag the trim selector), replace or remove it. Original-audio
 * mute lives on the main chrome.
 */
export function MusicSheet({
  track,
  videoDuration,
  onPickFile,
  onTrimChange,
  onRemove,
  onClose,
}: MusicSheetProps) {
  // Live drag position, shown immediately without waiting for the parent's
  // committed state — mirrors the volume slider's onValueChange pattern.
  const [liveTrimStart, setLiveTrimStart] = useState<number | null>(null);
  const displayedTrimStart = liveTrimStart ?? track?.trimStart ?? 0;
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#1C1C1E',
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        padding: 16,
        paddingBottom: 34,
        gap: 14,
      }}
    >
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#48484A' }} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '600' }}>Music</Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '600' }}>Done</Text>
        </Pressable>
      </View>

      {!track ? (
        <Pressable
          onPress={onPickFile}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 13,
            borderRadius: 12,
            backgroundColor: '#007AFF',
          }}
        >
          <Ionicons name="musical-notes" size={16} color="#FFF" />
          <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 14 }}>Add Music</Text>
        </Pressable>
      ) : (
        <View style={{ gap: 12 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: '#2C2C2E',
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Ionicons name="musical-note" size={18} color="#FFF" />
            <Text numberOfLines={1} style={{ color: '#FFF', fontSize: 13, flex: 1 }}>
              {track.title ?? 'Background track'}
            </Text>
            <Pressable onPress={onPickFile} hitSlop={8}>
              <Text style={{ color: '#007AFF', fontSize: 13, fontWeight: '600' }}>Replace</Text>
            </Pressable>
          </View>

          {track.duration > 0 && (
            <MusicTrimSelector
              trackUri={track.uri}
              trackDuration={track.duration}
              windowDuration={videoDuration}
              trimStart={displayedTrimStart}
              onTrimChange={setLiveTrimStart}
              onTrimCommit={(t) => {
                setLiveTrimStart(null);
                onTrimChange(t);
              }}
            />
          )}

          <Pressable
            onPress={onRemove}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 11,
              borderRadius: 12,
              backgroundColor: '#2C2C2E',
            }}
          >
            <Ionicons name="trash-outline" size={15} color="#FF453A" />
            <Text style={{ color: '#FF453A', fontWeight: '600', fontSize: 13 }}>Remove Music</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
