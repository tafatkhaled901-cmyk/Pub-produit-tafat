import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import type { JobView, Language } from '../lib/api';
import { strings } from '../lib/i18n';
import { colors } from '../theme';

interface Props {
  language: Language;
  /** null tant que la photo est en cours d'envoi. */
  job: JobView | null;
  /** Erreur survenue avant la création du job (envoi, réseau, crédits). */
  startError: string | null;
  onRetry: () => void;
  onBack: () => void;
}

/** Étape en cours (0 à 3) d'après le statut du job. */
function currentStep(job: JobView | null): number {
  if (!job) return 0;
  switch (job.status) {
    case 'queued':
      return 0;
    case 'analyzing':
      return job.product_name ? 1 : 0;
    case 'clips':
      return 2;
    case 'editing':
      return 3;
    default:
      return 4;
  }
}

function Pulse() {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [value]);
  const scale = value.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] });
  const opacity = value.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  return <Animated.View style={[styles.pulse, { opacity, transform: [{ scale }] }]} />;
}

export function Progress({ language, job, startError, onRetry, onBack }: Props) {
  const t = strings[language];
  const error = startError ?? (job?.status === 'failed' ? job.error ?? t.genericError : null);

  if (error) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>{t.failedTitle}</Text>
        <Text style={styles.error}>{error}</Text>
        <Pressable style={styles.primary} onPress={onRetry} accessibilityRole="button">
          <Text style={styles.primaryText}>{t.retry}</Text>
        </Pressable>
        <Pressable onPress={onBack} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.link}>{t.back}</Text>
        </Pressable>
      </View>
    );
  }

  const step = currentStep(job);
  return (
    <View style={styles.root}>
      <Pulse />
      {job?.product_name ? (
        <View style={styles.found}>
          <Text style={styles.product}>{job.product_name}</Text>
          {job.hook && <Text style={styles.hook}>« {job.hook} »</Text>}
        </View>
      ) : (
        <Text style={styles.title}>{job ? t.steps[0] : t.sending}</Text>
      )}

      <View style={styles.bar} accessibilityRole="progressbar">
        <View style={[styles.barFill, { width: `${Math.min(100, 10 + step * 26)}%` }]} />
      </View>

      <View style={styles.steps}>
        {t.steps.map((label, i) => (
          <View key={label} style={styles.stepRow}>
            <View style={[styles.dot, i < step && styles.dotDone, i === step && styles.dotActive]} />
            <Text style={[styles.stepText, i <= step && styles.stepTextOn]}>{label}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.hint}>{t.leaveHint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 20 },
  pulse: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.accent },
  title: { color: colors.text, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  found: { alignItems: 'center', gap: 6 },
  product: { color: colors.text, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  hook: { color: colors.muted, fontSize: 17, fontStyle: 'italic', textAlign: 'center' },
  bar: { width: '100%', height: 8, borderRadius: 4, backgroundColor: colors.card, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  steps: { alignSelf: 'stretch', gap: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.line },
  dotDone: { backgroundColor: colors.text },
  dotActive: { backgroundColor: colors.accent },
  stepText: { color: colors.muted, fontSize: 16 },
  stepTextOn: { color: colors.text, fontWeight: '600' },
  hint: { color: colors.muted, fontSize: 14, textAlign: 'center' },
  error: { color: colors.danger, fontSize: 16, textAlign: 'center' },
  primary: { backgroundColor: colors.accent, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 999 },
  primaryText: { color: colors.text, fontSize: 17, fontWeight: '700' },
  link: { color: colors.muted, fontSize: 16, textDecorationLine: 'underline', padding: 4 },
});
