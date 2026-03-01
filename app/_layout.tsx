import "@/i18n";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppSettingsProvider } from "@/contexts/AppSettingsContext";
import { useFonts } from "expo-font";
import {
  Quicksand_400Regular,
  Quicksand_600SemiBold,
  Quicksand_700Bold,
} from "@expo-google-fonts/quicksand";
import {
  MPLUSRounded1c_400Regular,
  MPLUSRounded1c_500Medium,
  MPLUSRounded1c_700Bold,
  MPLUSRounded1c_800ExtraBold,
} from "@expo-google-fonts/m-plus-rounded-1c";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Quicksand: Quicksand_700Bold, // Using bold as default for Quicksand since it's mostly used for titles
    "Quicksand-Regular": Quicksand_400Regular,
    "Quicksand-SemiBold": Quicksand_600SemiBold,
    "Quicksand-Bold": Quicksand_700Bold,
    "M PLUS Rounded 1c": MPLUSRounded1c_400Regular, // Default M PLUS Rounded
    "MPLUSRounded1c-Medium": MPLUSRounded1c_500Medium,
    "MPLUSRounded1c-Bold": MPLUSRounded1c_700Bold,
    "MPLUSRounded1c-ExtraBold": MPLUSRounded1c_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      // Hide the splash screen after the fonts have loaded (or an error was returned)
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Prevent rendering until the font has loaded or an error was returned
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AppSettingsProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#F5F3EF" }, // theme.colors.bg
          }}
        />
      </AppSettingsProvider>
    </SafeAreaProvider>
  );
}
