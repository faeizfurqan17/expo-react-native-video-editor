import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface EditToolsProps {
  onSplit: () => void;
  onDelete: () => void;
  onRotate: () => void;
  onSpeedPress: () => void;
  onVolumePress: () => void;
  onCropPress: () => void;
  hasSelectedSegment: boolean;
  canDelete: boolean;
}

interface ToolButtonProps {
  iconName: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

function ToolButton({ iconName, label, onPress, disabled, destructive }: ToolButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 12,
        backgroundColor: disabled ? '#222' : '#333',
        opacity: disabled ? 0.5 : 1,
        borderCurve: 'continuous',
        minWidth: 58,
      }}
    >
      <Ionicons name={iconName as any} size={14} color={destructive ? '#FF3B30' : '#FFF'} />
      <Text
        style={{
          color: destructive ? '#FF3B30' : '#FFF',
          fontSize: 10,
          fontWeight: '500',
          textAlign: 'center',
          marginTop: 1,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function EditTools({
  onSplit,
  onDelete,
  onRotate,
  onSpeedPress,
  onVolumePress,
  onCropPress,
  hasSelectedSegment,
  canDelete,
}: EditToolsProps) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      <ToolButton iconName="cut-outline" label="Split" onPress={onSplit} />
      <ToolButton iconName="speedometer-outline" label="Speed" onPress={onSpeedPress} />
      <ToolButton iconName="volume-high-outline" label="Volume" onPress={onVolumePress} />
      <ToolButton iconName="crop-outline" label="Crop" onPress={onCropPress} />
      <ToolButton iconName="refresh-outline" label="Rotate" onPress={onRotate} />
      <ToolButton
        iconName="trash-outline"
        label="Delete"
        onPress={onDelete}
        disabled={!hasSelectedSegment || !canDelete}
        destructive
      />
    </View>
  );
}
