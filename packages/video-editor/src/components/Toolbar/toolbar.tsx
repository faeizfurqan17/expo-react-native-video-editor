import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { EditorMode, FeatureConfig } from '../../core/types';

interface ToolbarProps {
  activeMode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  features?: FeatureConfig;
  children: React.ReactNode;
}

const MODES: { mode: EditorMode; label: string; icon: string; featureKey: keyof FeatureConfig }[] = [
  { mode: 'edit', label: 'Edit', icon: 'create-outline', featureKey: 'trim' },
  { mode: 'audio', label: 'Audio', icon: 'musical-notes-outline', featureKey: 'audio' },
  { mode: 'text', label: 'Text', icon: 'text-outline', featureKey: 'text' },
  { mode: 'filters', label: 'Filters', icon: 'color-filter-outline', featureKey: 'filters' },
  { mode: 'effects', label: 'Effects', icon: 'flash-outline', featureKey: 'effects' },
  { mode: 'stickers', label: 'Stickers', icon: 'happy-outline', featureKey: 'stickers' },
];

export function Toolbar({ activeMode, onModeChange, features, children }: ToolbarProps) {
  // Opt-in feature visibility: tabs render only when explicitly enabled.
  const enabledModes = MODES.filter((m) => features?.[m.featureKey] === true);

  return (
    <View style={{ backgroundColor: '#1a1a1a' }}>
      {/* Tool content area */}
      <View style={{ minHeight: 80, paddingHorizontal: 16, paddingVertical: 8 }}>
        {children}
      </View>

      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          flexDirection: 'row',
          gap: 4,
          paddingHorizontal: 16,
          paddingBottom: 8,
        }}
      >
        {enabledModes.map((item) => {
          const isActive = activeMode === item.mode;
          return (
            <Pressable
              key={item.mode}
              onPress={() => onModeChange(item.mode)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 12,
                backgroundColor: isActive ? '#007AFF' : '#333',
                borderCurve: 'continuous',
                minWidth: 62,
                alignItems: 'center',
              }}
            >
              <Ionicons name={item.icon as any} size={14} color={isActive ? '#FFF' : '#BDBDBD'} />
              <Text style={{ color: isActive ? '#FFF' : '#999', fontSize: 10, marginTop: 1 }}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
