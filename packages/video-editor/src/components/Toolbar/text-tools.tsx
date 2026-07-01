import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import type { TextOverlay } from '../../core/types';

const FONTS: { label: string; value: string }[] = [
  { label: 'Default', value: 'System' },
  { label: 'Helvetica', value: 'Helvetica' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Courier', value: 'Courier' },
  { label: 'Times', value: 'Times New Roman' },
];

const COLORS = [
  '#FFFFFF', '#000000', '#FF3B30', '#FF9500',
  '#FFCC00', '#34C759', '#007AFF', '#AF52DE', '#FF2D55',
];

const ALIGNMENTS = ['left', 'center', 'right'] as const;

/** Three-bar alignment indicator (unambiguous left/center/right). */
function AlignGlyph({ align, color }: { align: TextOverlay['alignment']; color: string }) {
  const items = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
  const bar = { height: 2, borderRadius: 1, backgroundColor: color } as const;
  return (
    <View style={{ width: 16, gap: 2.5, alignItems: items }}>
      <View style={[bar, { width: 16 }]} />
      <View style={[bar, { width: 10 }]} />
      <View style={[bar, { width: 16 }]} />
    </View>
  );
}

interface TextToolsProps {
  selectedOverlay: TextOverlay | null;
  currentTime: number;
  duration: number;
  onAddText: (overlay: Omit<TextOverlay, 'id'>) => void;
  onUpdateText: (id: string, updates: Partial<TextOverlay>) => void;
  onRemoveText: (id: string) => void;
  /** Commit the current text edit and return to the Add Text state. */
  onDone: () => void;
}

export function TextTools({
  selectedOverlay,
  currentTime,
  duration,
  onAddText,
  onUpdateText,
  onRemoveText,
  onDone,
}: TextToolsProps) {
  const textInputRef = useRef<TextInput>(null);

  // Auto-focus the input whenever a text overlay becomes selected (new or tapped).
  useEffect(() => {
    if (!selectedOverlay) return;
    const t = setTimeout(() => textInputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [selectedOverlay?.id]);

  const handleAddText = useCallback(() => {
    const start = Math.max(0, Math.min(currentTime, Math.max(0, duration - 3)));
    onAddText({
      text: '',
      font: 'System',
      fontSize: 32,
      color: '#FFFFFF',
      position: { x: 0.5, y: 0.5 },
      rotation: 0,
      scale: 1,
      alignment: 'center',
      startTime: start,
      endTime: Math.min(start + 3, duration),
    });
  }, [currentTime, duration, onAddText]);

  // Confirm tick — commit edit, drop empty overlays, dismiss keyboard, deselect.
  const handleDone = useCallback(() => {
    Keyboard.dismiss();
    if (selectedOverlay && selectedOverlay.text.trim() === '') {
      onRemoveText(selectedOverlay.id);
    }
    onDone();
  }, [selectedOverlay, onRemoveText, onDone]);

  // ── No text selected → Add Text button ────────────────────────────────────
  if (!selectedOverlay) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 4 }}>
        <Pressable
          onPress={handleAddText}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 28,
            paddingVertical: 11,
            backgroundColor: '#007AFF',
            borderRadius: 22,
            borderCurve: 'continuous',
          }}
        >
          <Ionicons name="add" size={18} color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '600' }}>Add Text</Text>
        </Pressable>
      </View>
    );
  }

  // ── Editing panel ─────────────────────────────────────────────────────────
  const { id, text, font, fontSize, color, alignment, backgroundColor } = selectedOverlay;
  const isHighlighted = !!backgroundColor;

  return (
    <View style={{ gap: 10 }}>
      {/* Header: title + confirm tick */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '600' }}>Edit Text</Text>
        <Pressable
          onPress={handleDone}
          hitSlop={10}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: '#007AFF',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="checkmark" size={20} color="#FFF" />
        </Pressable>
      </View>

      {/* Text input — auto-focused, updates overlay live */}
      <TextInput
        ref={textInputRef}
        value={text}
        onChangeText={(t) => onUpdateText(id, { text: t })}
        placeholder="Type something..."
        placeholderTextColor="#555"
        multiline
        style={{
          backgroundColor: '#222',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          color: '#FFF',
          fontSize: 15,
          borderCurve: 'continuous',
          minHeight: 44,
          maxHeight: 88,
        }}
      />

      {/* Alignment + highlight + size slider */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {ALIGNMENTS.map((align) => (
          <Pressable
            key={align}
            onPress={() => onUpdateText(id, { alignment: align })}
            style={{
              width: 38,
              height: 34,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: alignment === align ? '#007AFF' : '#2C2C2E',
              borderCurve: 'continuous',
            }}
          >
            <AlignGlyph align={align} color="#FFF" />
          </Pressable>
        ))}

        {/* Background-highlight toggle */}
        <Pressable
          onPress={() =>
            onUpdateText(id, {
              backgroundColor: isHighlighted ? undefined : 'rgba(0,0,0,0.65)',
            })
          }
          style={{
            width: 38,
            height: 34,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isHighlighted ? '#007AFF' : '#2C2C2E',
            borderCurve: 'continuous',
          }}
        >
          <Ionicons name="albums-outline" size={16} color="#FFF" />
        </Pressable>

        {/* Font-size slider */}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Slider
            style={{ flex: 1 }}
            minimumValue={14}
            maximumValue={72}
            value={fontSize}
            step={1}
            minimumTrackTintColor="#007AFF"
            maximumTrackTintColor="#3A3A3C"
            thumbTintColor="#007AFF"
            onValueChange={(v) => onUpdateText(id, { fontSize: Math.round(v) })}
          />
          <Text style={{ color: '#666', fontSize: 11, width: 24, textAlign: 'right' }}>
            {Math.round(fontSize)}
          </Text>
        </View>
      </View>

      {/* Color swatches */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}
      >
        {COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => onUpdateText(id, { color: c })}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: c,
              borderWidth: color === c ? 3 : 1.5,
              borderColor: color === c ? '#007AFF' : 'rgba(255,255,255,0.15)',
            }}
          />
        ))}
      </ScrollView>

      {/* Font chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}
      >
        {FONTS.map(({ label, value }) => (
          <Pressable
            key={value}
            onPress={() => onUpdateText(id, { font: value })}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 7,
              borderRadius: 8,
              backgroundColor: font === value ? '#007AFF' : '#2C2C2E',
              borderCurve: 'continuous',
            }}
          >
            <Text
              style={{
                color: '#FFF',
                fontSize: 13,
                fontFamily: value === 'System' ? undefined : value,
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Delete */}
      <Pressable
        onPress={() => {
          onRemoveText(id);
          onDone();
        }}
        style={{
          flexDirection: 'row',
          gap: 6,
          paddingVertical: 9,
          borderRadius: 10,
          backgroundColor: '#2C2C2E',
          alignItems: 'center',
          justifyContent: 'center',
          borderCurve: 'continuous',
        }}
      >
        <Ionicons name="trash-outline" size={15} color="#FF453A" />
        <Text style={{ color: '#FF453A', fontWeight: '600', fontSize: 13 }}>Delete</Text>
      </Pressable>
    </View>
  );
}
