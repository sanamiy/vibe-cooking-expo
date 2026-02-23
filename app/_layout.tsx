import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppSettingsProvider } from '@/contexts/AppSettingsContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppSettingsProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#FFF8F3' },
          }}
        />
      </AppSettingsProvider>
    </SafeAreaProvider>
  );
}
