import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Settings = {
  backgroundPlayback: boolean;
};

type SettingsContextValue = Settings & {
  setBackgroundPlayback: (value: boolean) => void;
};

const STORAGE_KEY = "moodbeatz.settings.v1";

const DEFAULTS: Settings = {
  backgroundPlayback: false,
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

const loadSettings = (): Settings => {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
};

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore quota errors
    }
  }, [settings]);

  const setBackgroundPlayback = (value: boolean) =>
    setSettings((prev) => ({ ...prev, backgroundPlayback: value }));

  return (
    <SettingsContext.Provider value={{ ...settings, setBackgroundPlayback }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider");
  return ctx;
};
