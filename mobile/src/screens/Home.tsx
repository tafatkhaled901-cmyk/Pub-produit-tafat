import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Language, Tone } from '../lib/api';
import { LANGUAGES, strings, toneLabels, TONES } from '../lib/i18n';
import { colors } from '../theme';

interface Props {
  credits: number | null;
  tone: Tone;
  language: Language;
  message: string | null;
  onTone: (tone: Tone) => void;
  onLanguage: (language: Language) => void;
  onCapture: () => void;
  onImport: () => void;
}

function Chip(props: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: props.active }}
      style={[styles.chip, props.active && styles.chipActive]}
    >
      <Text style={[styles.chipText, props.active && styles.chipTextActive]}>{props.label}</Text>
    </Pressable>
  );
}

export function Home(props: Props) {
  const t = strings[props.language];
  const empty = props.credits === 0;

  return (
    <View style={styles.root}>
      <View>
        <Text style={styles.brand}>Pub Produit</Text>
        <Text style={styles.tagline}>{t.tagline}</Text>
        {props.credits !== null && (
          <View style={styles.credits}>
            <Text style={styles.creditsText}>{empty ? t.noCredits : t.credits(props.credits)}</Text>
          </View>
        )}
      </View>

      <View style={styles.options}>
        <Text style={styles.label}>{t.tone}</Text>
        <View style={styles.row}>
          {TONES.map((tone) => (
            <Chip
              key={tone}
              label={toneLabels[props.language][tone]}
              active={tone === props.tone}
              onPress={() => props.onTone(tone)}
            />
          ))}
        </View>
        <Text style={styles.label}>{t.language}</Text>
        <View style={styles.row}>
          {LANGUAGES.map((l) => (
            <Chip
              key={l.code}
              label={l.label}
              active={l.code === props.language}
              onPress={() => props.onLanguage(l.code)}
            />
          ))}
        </View>
      </View>

      <View style={styles.actions}>
        {props.message && <Text style={styles.message}>{props.message}</Text>}
        <Pressable
          onPress={props.onCapture}
          disabled={empty}
          accessibilityRole="button"
          accessibilityLabel={t.capture}
          style={({ pressed }) => [styles.shutter, pressed && styles.pressed, empty && styles.disabled]}
        >
          <View style={styles.shutterInner} />
        </Pressable>
        <Text style={styles.captureText}>{t.capture}</Text>
        <Pressable onPress={props.onImport} disabled={empty} accessibilityRole="button" hitSlop={12}>
          <Text style={[styles.importText, empty && styles.disabled]}>{t.importPhoto}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, justifyContent: 'space-between' },
  brand: { color: colors.text, fontSize: 34, fontWeight: '800' },
  tagline: { color: colors.muted, fontSize: 17, marginTop: 6 },
  credits: {
    alignSelf: 'flex-start',
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.card,
  },
  creditsText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  options: { gap: 10 },
  label: { color: colors.muted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginTop: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 15 },
  chipTextActive: { fontWeight: '700' },
  actions: { alignItems: 'center', gap: 12 },
  message: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  shutter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 4,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accent },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.35 },
  captureText: { color: colors.text, fontSize: 17, fontWeight: '700' },
  importText: { color: colors.muted, fontSize: 16, textDecorationLine: 'underline', padding: 4 },
});
