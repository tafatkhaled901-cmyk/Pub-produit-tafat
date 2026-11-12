import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError, type JobView, type Language, type Tone } from './src/lib/api';
import { strings } from './src/lib/i18n';
import { useJob } from './src/lib/useJob';
import { Home } from './src/screens/Home';
import { Preview } from './src/screens/Preview';
import { Progress } from './src/screens/Progress';
import { colors } from './src/theme';

type Screen = 'home' | 'progress' | 'preview';

const JOB_KEY = 'pub-produit:current-job';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [tone, setTone] = useState<Tone>('dynamique');
  const [language, setLanguage] = useState<Language>('fr');
  const [credits, setCredits] = useState<number | null>(null);
  const [homeMessage, setHomeMessage] = useState<string | null>(null);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [video, setVideo] = useState<JobView | null>(null);

  const job = useJob(screen === 'progress' ? jobId : null);
  const t = strings[language];

  const refreshCredits = useCallback(async () => {
    try {
      setCredits((await api.me()).credits);
    } catch {
      // Hors connexion : le compteur s'affichera au prochain essai.
    }
  }, []);

  // Au lancement : crédits, et reprise d'une vidéo lancée avant la fermeture de l'app.
  useEffect(() => {
    void refreshCredits();
    void AsyncStorage.getItem(JOB_KEY).then((saved) => {
      if (saved) {
        setJobId(saved);
        setScreen('progress');
      }
    });
  }, [refreshCredits]);

  // Le job suivi se termine : on passe à la prévisualisation.
  useEffect(() => {
    if (!job) return;
    if (job.status === 'done') {
      setLanguage(job.language);
      setVideo(job);
      setScreen('preview');
      void AsyncStorage.removeItem(JOB_KEY);
    } else if (job.status === 'failed') {
      void AsyncStorage.removeItem(JOB_KEY);
      void refreshCredits(); // le crédit a été rendu
    }
  }, [job, refreshCredits]);

  const start = useCallback(
    async (uri: string) => {
      setPhotoUri(uri);
      setJobId(null);
      setStartError(null);
      setScreen('progress');
      try {
        const photoPath = await api.uploadPhoto(uri);
        const created = await api.createVideo(photoPath, tone, language);
        setCredits(created.credits);
        setJobId(created.id);
        await AsyncStorage.setItem(JOB_KEY, created.id);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'NO_CREDITS') {
          setCredits(0);
          setHomeMessage(null);
          setScreen('home');
          return;
        }
        setStartError(err instanceof ApiError ? err.message : t.genericError);
      }
    },
    [tone, language, t.genericError],
  );

  const pick = useCallback(
    async (source: 'camera' | 'library') => {
      setHomeMessage(null);
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', quality: 0.8 };
      let result: ImagePicker.ImagePickerResult;
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setHomeMessage(t.cameraDenied);
          return;
        }
        result = await ImagePicker.launchCameraAsync(options);
      } else {
        result = await ImagePicker.launchImageLibraryAsync(options);
      }
      const uri = result.canceled ? null : result.assets[0]?.uri;
      if (uri) void start(uri);
    },
    [start, t.cameraDenied],
  );

  const goHome = useCallback(() => {
    void AsyncStorage.removeItem(JOB_KEY);
    setJobId(null);
    setVideo(null);
    setStartError(null);
    setScreen('home');
    void refreshCredits();
  }, [refreshCredits]);

  return (
    <SafeAreaProvider>
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      {screen === 'home' && (
        <Home
          credits={credits}
          tone={tone}
          language={language}
          message={homeMessage}
          onTone={setTone}
          onLanguage={setLanguage}
          onCapture={() => void pick('camera')}
          onImport={() => void pick('library')}
        />
      )}
      {screen === 'progress' && (
        <Progress
          language={language}
          job={job}
          startError={startError}
          onRetry={() => (photoUri ? void start(photoUri) : goHome())}
          onBack={goHome}
        />
      )}
      {screen === 'preview' && video && <Preview job={video} onReplaced={setVideo} onNew={goHome} />}
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
