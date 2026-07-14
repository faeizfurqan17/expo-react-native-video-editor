import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Slider from '@react-native-community/slider';
import type { TextOverlay } from '../../core/types';

const MIN_FONT_SIZE = 14;
const MAX_FONT_SIZE = 72;
const SIZE_SLIDER_TRACK_LENGTH = 320;
// Must mirror the top bar's own layout (paddingTop + button height) so the
// slider strip lines up directly beneath the alignment button, not floating
// disconnected from it.
const TOP_BAR_TOP = 250;
const TOP_BAR_BUTTON_SIZE = 38;

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

export type TextDraft = Pick<
  TextOverlay,
  'text' | 'font' | 'fontSize' | 'color' | 'backgroundColor' | 'alignment'
>;

interface TextEntryOverlayProps {
  /** Existing overlay values when editing; null when creating new. */
  initial: TextDraft | null;
  onDone: (draft: TextDraft) => void;
  onCancel: () => void;
}

/**
 * Instagram-style fullscreen text editor: dark backdrop, centered auto-focused
 * input rendered with the live style, controls around it. Done commits;
 * empty text cancels/deletes.
 */
export function TextEntryOverlay({ initial, onDone, onCancel }: TextEntryOverlayProps) {
  const [text, setText] = useState(initial?.text ?? '');
  const [font, setFont] = useState(initial?.font ?? 'System');
  const [fontSize, setFontSize] = useState(initial?.fontSize ?? 32);
  const [color, setColor] = useState(initial?.color ?? '#FFFFFF');
  const [backgroundColor, setBackgroundColor] = useState(initial?.backgroundColor);
  const [alignment, setAlignment] = useState<TextOverlay['alignment']>(
    initial?.alignment ?? 'center'
  );
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const handleDone = () => {
    if (text.trim().length === 0) {
      onCancel();
      return;
    }
    onDone({ text: text.trim(), font, fontSize, color, backgroundColor, alignment });
  };

  const alignIndex = ALIGNMENTS.indexOf(alignment);

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.75)',
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Top bar: alignment + background toggle + Done */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingTop: 56,
          }}
        >
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => setAlignment(ALIGNMENTS[(alignIndex + 1) % 3])}
              hitSlop={8}
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: 'rgba(255,255,255,0.15)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlignGlyph align={alignment} color="#FFF" />
            </Pressable>
            <Pressable
              onPress={() =>
                setBackgroundColor(backgroundColor ? undefined : 'rgba(0,0,0,0.65)')
              }
              hitSlop={8}
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: backgroundColor
                  ? 'rgba(255,255,255,0.9)'
                  : 'rgba(255,255,255,0.15)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  color: backgroundColor ? '#000' : '#FFF',
                  fontWeight: '700',
                  fontSize: 15,
                }}
              >
                A
              </Text>
            </Pressable>
          </View>

          <Pressable onPress={handleDone} hitSlop={10}>
            <Text style={{ color: '#FFF', fontSize: 17, fontWeight: '700' }}>Done</Text>
          </Pressable>
        </View>

        {/* Centered live-styled input */}
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            multiline
            placeholder="Type something"
            placeholderTextColor="rgba(255,255,255,0.4)"
            style={{
              fontSize,
              // Without an explicit lineHeight, the native line box doesn't
              // reliably grow in lockstep with fontSize on every platform —
              // dragging the size slider up can then clip ascenders/descenders
              // (a line's top half gets cut off while the next line's bottom
              // renders fine, i.e. one baseline visually "eating" another).
              // Tying it directly to fontSize keeps the glyph box always
              // exactly as tall as the font actually needs.
              lineHeight: fontSize * 1.25,
              // Matching minHeight so a single line never gets a box shorter
              // than its own lineHeight while multiline is reflowing mid-edit.
              minHeight: fontSize * 1.25 + 12,
              color,
              fontFamily: font === 'System' ? undefined : font,
              textAlign: alignment,
              backgroundColor: backgroundColor ?? 'transparent',
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              alignSelf:
                alignment === 'left'
                  ? 'flex-start'
                  : alignment === 'right'
                    ? 'flex-end'
                    : 'center',
              maxWidth: '100%',
            }}
          />
        </View>

        {/* Font chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          style={{ flexGrow: 0, marginBottom: 10 }}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
        >
          {FONTS.map(({ label, value }) => (
            <Pressable
              key={value}
              onPress={() => setFont(value)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 16,
                backgroundColor:
                  font === value ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.15)',
              }}
            >
              <Text
                style={{
                  color: font === value ? '#000' : '#FFF',
                  fontSize: 13,
                  fontFamily: value === 'System' ? undefined : value,
                }}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Color swatches */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          style={{ flexGrow: 0, marginBottom: 16 }}
          contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}
        >
          {COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: c,
                borderWidth: color === c ? 3 : 1.5,
                borderColor: color === c ? '#FFF' : 'rgba(255,255,255,0.35)',
              }}
            />
          ))}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Instagram-style vertical font-size slider: a strip running down the
          screen directly under the alignment button, in the same left
          column, instead of a row of fixed numbered sizes. */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 16,
          top: TOP_BAR_TOP + TOP_BAR_BUTTON_SIZE + 16,
          width: 40,
          height: SIZE_SLIDER_TRACK_LENGTH,
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: SIZE_SLIDER_TRACK_LENGTH,
            height: 40,
            transform: [{ rotate: '-90deg' }],
          }}
        >
          <Slider
            style={{ width: SIZE_SLIDER_TRACK_LENGTH, height: 40 }}
            minimumValue={MIN_FONT_SIZE}
            maximumValue={MAX_FONT_SIZE}
            value={fontSize}
            onValueChange={setFontSize}
            minimumTrackTintColor="#FFF"
            maximumTrackTintColor="rgba(255,255,255,0.25)"
            thumbTintColor="#FFF"
          />
        </View>
      </View>
    </View>
  );
}
