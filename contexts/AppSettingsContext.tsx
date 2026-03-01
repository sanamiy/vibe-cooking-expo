import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type SchedulerAlgorithm = "auto" | "greedy" | "genetic" | "critical_path" | "backward" | "astar";

interface AppSettings {
  servingsPerMeal: number;
  stoveBurners: number;
  schedulerAlgorithm: SchedulerAlgorithm;
}

interface AppSettingsContextValue {
  settings: AppSettings;
  updateSettings: (next: Partial<AppSettings>) => void;
  isReady: boolean;
}

const SETTINGS_KEY = "app-settings";
const defaultSettings: AppSettings = {
  servingsPerMeal: 4,
  stoveBurners: 2,
  schedulerAlgorithm: "auto",
};

const AppSettingsContext = createContext<AppSettingsContextValue | undefined>(
  undefined,
);

export const AppSettingsProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const hydrate = async () => {
      try {
        const stored = await AsyncStorage.getItem(SETTINGS_KEY);
        if (stored) {
          setSettings({
            ...defaultSettings,
            ...(JSON.parse(stored) as Partial<AppSettings>),
          });
        }
      } finally {
        setIsReady(true);
      }
    };
    hydrate();
  }, []);

  useEffect(() => {
    if (!isReady) return;
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)).catch(
      () => undefined,
    );
  }, [isReady, settings]);

  const value = useMemo(
    () => ({
      settings,
      updateSettings: (next: Partial<AppSettings>) =>
        setSettings((prev) => ({ ...prev, ...next })),
      isReady,
    }),
    [isReady, settings],
  );

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
};

export const useAppSettings = () => {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) {
    throw new Error("useAppSettings must be used within AppSettingsProvider");
  }
  return ctx;
};
