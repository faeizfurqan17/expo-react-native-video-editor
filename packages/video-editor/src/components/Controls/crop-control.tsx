import React from 'react';
import { View, Text, Pressable } from 'react-native';
import type { CropPreset, CropRegion } from '../../core/types';

const CROP_PRESETS: { preset: CropPreset; label: string }[] = [
  { preset: 'original', label: 'Original' },
  { preset: '1:1', label: '1:1' },
  { preset: '4:5', label: '4:5' },
  { preset: '9:16', label: '9:16' },
  { preset: '16:9', label: '16:9' },
];

interface CropControlProps {
  currentCrop: CropRegion | null;
  videoWidth: number;
  videoHeight: number;
  onCropChange: (crop: CropRegion | null) => void;
}

function calculateCropRegion(
  preset: CropPreset,
  videoWidth: number,
  videoHeight: number
): CropRegion | null {
  if (preset === 'original') return null;

  const ratios: Record<string, [number, number]> = {
    '1:1': [1, 1],
    '4:5': [4, 5],
    '9:16': [9, 16],
    '16:9': [16, 9],
  };

  const [rw, rh] = ratios[preset] ?? [1, 1];
  const targetRatio = rw / rh;
  const videoRatio = videoWidth / videoHeight;

  let cropWidth: number;
  let cropHeight: number;

  if (targetRatio > videoRatio) {
    cropWidth = videoWidth;
    cropHeight = videoWidth / targetRatio;
  } else {
    cropHeight = videoHeight;
    cropWidth = videoHeight * targetRatio;
  }

  return {
    x: (videoWidth - cropWidth) / 2,
    y: (videoHeight - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight,
  };
}

function isCropMatchingPreset(
  crop: CropRegion | null,
  preset: CropPreset,
  videoWidth: number,
  videoHeight: number
): boolean {
  if (preset === 'original') return !crop;
  if (!crop) return false;
  const expected = calculateCropRegion(preset, videoWidth, videoHeight);
  if (!expected) return false;
  return (
    Math.abs(crop.width - expected.width) < 1 &&
    Math.abs(crop.height - expected.height) < 1
  );
}

export function CropControl({
  currentCrop,
  videoWidth,
  videoHeight,
  onCropChange,
}: CropControlProps) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: '#999', fontSize: 12 }}>Aspect Ratio</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {CROP_PRESETS.map(({ preset, label }) => {
          const isActive = isCropMatchingPreset(currentCrop, preset, videoWidth, videoHeight);
          return (
            <Pressable
              key={preset}
              onPress={() => onCropChange(calculateCropRegion(preset, videoWidth, videoHeight))}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: isActive ? '#007AFF' : '#333',
                alignItems: 'center',
                borderCurve: 'continuous',
              }}
            >
              <Text
                style={{
                  color: '#FFF',
                  fontSize: 12,
                  fontWeight: isActive ? '600' : '400',
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
