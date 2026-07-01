import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { FILTER_PRESETS } from '../../filters/presets';
import type { FilterPreset } from '../../core/types';

interface FilterToolsProps {
  activeFilter: FilterPreset;
  intensity: number;
  segmentLabel?: string;
  onFilterSelect: (preset: FilterPreset) => void;
  onIntensityChange: (intensity: number) => void;
  onApplyAll?: () => void;
}

export function FilterTools({
  activeFilter,
  intensity,
  segmentLabel,
  onFilterSelect,
  onIntensityChange,
  onApplyAll,
}: FilterToolsProps) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: '#999', fontSize: 12 }}>
          {segmentLabel ? `${segmentLabel} filter` : 'Segment filter'}
        </Text>
        {onApplyAll && (
          <Pressable
            onPress={onApplyAll}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: '#2f2f2f',
            }}
          >
            <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '600' }}>Apply all</Text>
          </Pressable>
        )}
      </View>

      {/* Filter list */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {FILTER_PRESETS.map((filter) => {
          const isActive = activeFilter === filter.preset;
          return (
            <Pressable
              key={filter.preset}
              onPress={() => onFilterSelect(filter.preset)}
              style={{
                width: 64,
                height: 64,
                borderRadius: 12,
                backgroundColor: isActive ? '#007AFF' : '#333',
                justifyContent: 'center',
                alignItems: 'center',
                borderWidth: isActive ? 2 : 0,
                borderColor: '#007AFF',
                borderCurve: 'continuous',
              }}
            >
              <Ionicons name="color-filter-outline" size={14} color="#FFF" />
              <Text
                style={{
                  color: '#FFF',
                  fontSize: 9,
                  fontWeight: isActive ? '600' : '400',
                  textAlign: 'center',
                  marginTop: 1,
                }}
              >
                {filter.displayName}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Intensity slider */}
      {activeFilter !== 'normal' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: '#999', fontSize: 12 }}>Intensity</Text>
          <Slider
            style={{ flex: 1, height: 32 }}
            value={intensity}
            minimumValue={0}
            maximumValue={1}
            step={0.01}
            onValueChange={onIntensityChange}
            minimumTrackTintColor="#007AFF"
            maximumTrackTintColor="#555"
            thumbTintColor="#FFF"
          />
          <Text style={{ color: '#999', fontSize: 12, width: 36, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
            {Math.round(intensity * 100)}%
          </Text>
        </View>
      )}
    </View>
  );
}
