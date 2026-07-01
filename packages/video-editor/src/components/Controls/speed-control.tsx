import React from 'react';
import { View, Text, Pressable } from 'react-native';

const SPEED_OPTIONS = [0.25, 0.5, 1, 1.5, 2, 3];

interface SpeedControlProps {
  currentSpeed: number;
  onSpeedChange: (speed: number) => void;
}

export function SpeedControl({ currentSpeed, onSpeedChange }: SpeedControlProps) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: '#999', fontSize: 12 }}>Playback Speed</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {SPEED_OPTIONS.map((speed) => (
          <Pressable
            key={speed}
            onPress={() => onSpeedChange(speed)}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: currentSpeed === speed ? '#007AFF' : '#333',
              alignItems: 'center',
              borderCurve: 'continuous',
            }}
          >
            <Text
              style={{
                color: '#FFF',
                fontSize: 13,
                fontWeight: currentSpeed === speed ? '600' : '400',
                fontVariant: ['tabular-nums'],
              }}
            >
              {speed}x
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
