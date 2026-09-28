import { create } from 'zustand';
import { DEFAULT_SETTINGS, type Lang, type Settings } from '@cc/shared';
import { api } from '../lib/api';

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  /** Active UI language: a player's own choice, else the configured default. */
  lang: Lang;
  langOverride: Lang | null;
  load(): Promise<void>;
  apply(s: Settings): void;
  setLang(lang: Lang | null): void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  lang: DEFAULT_SETTINGS.language,
  langOverride: null,
  async load() {
    try {
      get().apply(await api.settings());
    } catch {
      set({ loaded: true });
    }
  },
  apply(settings) {
    document.documentElement.dataset.theme = settings.theme;
    set({ settings, loaded: true, lang: get().langOverride ?? settings.language });
  },
  setLang(langOverride) {
    const lang = langOverride ?? get().settings.language;
    document.documentElement.lang = lang;
    set({ langOverride, lang });
  },
}));
