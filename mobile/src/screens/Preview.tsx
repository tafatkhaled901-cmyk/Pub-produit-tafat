import { File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { api, type JobView, type Tone } from '../lib/api';
import { strings, toneLabels, TONES } from '../lib/i18n';
import { useJob } from '../lib/useJob';
import { colors } from '../theme';

interface Props {
  /** Job terminé, avec son lien vidéo. */
  job: JobView;
  /** Appelé quand une retouche a produit une nouvelle version. */
  onReplaced: (job: JobView) => void;
  onNew: () => void;
}

/** Télécharge la vidéo dans le cache de l'app (nécessaire pour enregistrer ou partager). */
async function downloadVideo(job: JobView): Promise<File> {
  const target = new File(Paths.cache, `pub-produit-${job.id}.mp4`);
  if (target.exists) return target;
  return File.downloadFileAsync(job.video_url as string, target, { idempotent: true });
}

export function Preview({ job, onReplaced, onNew }: Props) {
  const t = strings[job.language];
  const [remixId, setRemixId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const remix = useJob(remixId);

  const player = useVideoPlayer(job.video_url, (p) => {
    p.loop = true;
    p.play();
  });

  // Une retouche terminée remplace la vidéo affichée.
  useEffect(() => {
    if (!remix) return;
    if (remix.status === 'done') {
      setRemixId(null);
      onReplaced(remix);
    } else if (remix.status === 'failed') {
      setRemixId(null);
      setNotice({ text: remix.error ?? t.genericError, error: true });
    }
  }, [remix, onReplaced, t.genericError]);

  const rendering = remixId !== null;

  const startRemix = async (change: { tone?: Tone; music?: number }) => {
    if (rendering) return;
    setNotice(null);
    try {
      const { id } = await api.remix(job.id, change);
      setRemixId(id);
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : t.genericError, error: true });
    }
  };

  const save = async () => {
    setBusy('save');
    setNotice(null);
    try {
      const permission = await requestPermissionsAsync(true);
      if (!permission.granted) {
        setNotice({ text: t.saveDenied, error: true });
        return;
      }
      const file = await downloadVideo(job);
      await Asset.create(file.uri);
      setNotice({ text: t.saved, error: false });
    } catch {
      setNotice({ text: t.genericError, error: true });
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    setBusy('share');
    setNotice(null);
    try {
      const file = await downloadVideo(job);
      // Feuille de partage native : TikTok, Instagram, YouTube, WhatsApp…
      await Sharing.shareAsync(file.uri, { mimeType: 'video/mp4', UTI: 'public.mpeg-4' });
    } catch {
      setNotice({ text: t.genericError, error: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.videoBox}>
        <VideoView player={player} style={styles.video} contentFit="contain" nativeControls={false} />
        {rendering && (
          <View style={styles.overlay}>
            <ActivityIndicator color={colors.text} size="large" />
            <Text style={styles.overlayText}>{t.rendering}</Text>
          </View>
        )}
      </View>

      {notice && <Text style={[styles.notice, notice.error && styles.noticeError]}>{notice.text}</Text>}

      <View style={styles.row}>
        {TONES.map((tone) => (
          <Pressable
            key={tone}
            disabled={rendering || tone === job.tone}
            onPress={() => void startRemix({ tone })}
            accessibilityRole="button"
            accessibilityState={{ selected: tone === job.tone }}
            style={[styles.chip, tone === job.tone && styles.chipActive, rendering && styles.disabled]}
          >
            <Text style={styles.chipText}>{toneLabels[job.language][tone]}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        disabled={rendering}
        onPress={() => void startRemix({ music: (job.music % 3) + 1 })}
        accessibilityRole="button"
        style={[styles.secondary, rendering && styles.disabled]}
      >
        <Text style={styles.secondaryText}>
          {t.music} ({job.music}/3)
        </Text>
      </Pressable>

      <View style={styles.row}>
        <Pressable
          style={[styles.primary, busy !== null && styles.disabled]}
          disabled={busy !== null}
          onPress={() => void save()}
          accessibilityRole="button"
        >
          {busy === 'save' ? <ActivityIndicator color={colors.text} /> : <Text style={styles.primaryText}>{t.save}</Text>}
        </Pressable>
        <Pressable
          style={[styles.primary, busy !== null && styles.disabled]}
          disabled={busy !== null}
          onPress={() => void share()}
          accessibilityRole="button"
        >
          {busy === 'share' ? <ActivityIndicator color={colors.text} /> : <Text style={styles.primaryText}>{t.share}</Text>}
        </Pressable>
      </View>

      <Pressable onPress={onNew} accessibilityRole="button" hitSlop={12}>
        <Text style={styles.link}>{t.newVideo}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 12, alignItems: 'center' },
  videoBox: {
    flex: 1,
    alignSelf: 'stretch',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: { flex: 1 },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  overlayText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  notice: { color: colors.text, fontSize: 14, textAlign: 'center' },
  noticeError: { color: colors.danger },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.line },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  secondary: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999, backgroundColor: colors.card },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  primary: {
    minWidth: 140,
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  primaryText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  link: { color: colors.muted, fontSize: 15, textDecorationLine: 'underline', padding: 4 },
});
