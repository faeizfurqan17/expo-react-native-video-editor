import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { EffectType, Effect } from '../../core/types';

const EFFECTS: { type: EffectType; label: string; iconName: string }[] = [
  { type: 'zoom_in', label: 'Zoom In', iconName: 'add-circle-outline' },
  { type: 'zoom_out', label: 'Zoom Out', iconName: 'remove-circle-outline' },
  { type: 'glitch', label: 'Glitch', iconName: 'pulse-outline' },
  { type: 'vhs', label: 'VHS', iconName: 'tv-outline' },
  { type: 'soul', label: 'Soul', iconName: 'sparkles-outline' },
  { type: 'shake', label: 'Shake', iconName: 'sync-outline' },
  { type: 'flash', label: 'Flash', iconName: 'flash-outline' },
];

interface EffectToolsProps {
  activeEffects: Effect[];
  currentTime: number;
  onAddEffect: (effect: Omit<Effect, 'id'>) => void;
  onRemoveEffect: (id: string) => void;
}

export function EffectTools({
  activeEffects,
  currentTime,
  onAddEffect,
  onRemoveEffect,
}: EffectToolsProps) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {EFFECTS.map((effect) => (
          <Pressable
            key={effect.type}
            onPress={() =>
              onAddEffect({
                type: effect.type,
                startTime: currentTime,
                duration: 1,
                intensity: 1,
              })
            }
            style={{
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: 12,
              backgroundColor: '#333',
              borderCurve: 'continuous',
              minWidth: 72,
              alignItems: 'center',
            }}
          >
            <Ionicons name={effect.iconName as any} size={14} color="#FFF" />
            <Text style={{ color: '#FFF', fontSize: 10, marginTop: 1 }}>{effect.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Active effects list */}
      {activeEffects.length > 0 && (
        <View style={{ gap: 4, marginTop: 4 }}>
          <Text style={{ color: '#999', fontSize: 11 }}>Active Effects:</Text>
          {activeEffects.map((effect) => (
            <View
              key={effect.id}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#2a2a2a',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 8,
                borderCurve: 'continuous',
              }}
            >
              <Text style={{ color: '#FFF', fontSize: 12 }}>
                {EFFECTS.find((e) => e.type === effect.type)?.label} @ {effect.startTime.toFixed(1)}s
              </Text>
              <Pressable onPress={() => onRemoveEffect(effect.id)}>
                <Text style={{ color: '#FF3B30', fontSize: 12, fontWeight: '600' }}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
