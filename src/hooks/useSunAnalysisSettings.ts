import { useState, useEffect, useCallback } from 'react';

export type AnalysisPrecision = 'low' | 'medium' | 'high';

export interface SunAnalysisSettings {
  selectedGradient: string;
  selectedViewportGradient: string;
  analysisDate: string;
  analysisTime: string;
  precision: AnalysisPrecision;
  interval: number;
}

const STORAGE_KEY = '3dm-viewer-sun-analysis-settings';

const DEFAULT_SETTINGS: SunAnalysisSettings = {
  selectedGradient: 'turbo',
  selectedViewportGradient: 'sketchup_blue',
  analysisDate: new Date().toISOString().split('T')[0],
  analysisTime: '10:30:00',
  precision: 'medium',
  interval: 30,
};

function loadFromStorage(): SunAnalysisSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.error('Failed to load sun analysis settings from localStorage', e);
  }
  return DEFAULT_SETTINGS;
}

function saveToStorage(settings: SunAnalysisSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save sun analysis settings to localStorage', e);
  }
}

export function useSunAnalysisSettings() {
  const [settings, setSettings] = useState<SunAnalysisSettings>(loadFromStorage);

  useEffect(() => {
    saveToStorage(settings);
  }, [settings]);

  const updateSettings = useCallback((partial: Partial<SunAnalysisSettings>) => {
    setSettings(prev => ({ ...prev, ...partial }));
  }, []);

  return { settings, updateSettings };
}