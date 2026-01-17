import { useState, useEffect, useCallback } from 'react';

const SETTINGS_KEY = '3dm-viewer-settings';

export interface ViewerSettings {
    bgTop: string;
    bgBottom: string;
    latitude: number;
    longitude: number;
    projection: 'perspective' | 'orthographic';
    showEdges: boolean;
    shadows: boolean;
    shadowQuality: number;
    shadowBias: number;
    shadowRadius: number;
    ambientIntensity: number;
    ambientColor: string;
    brightness: number;
    month?: number;
    day?: number;
    hour?: number;
}

const DEFAULT_SETTINGS: ViewerSettings = {
    bgTop: '#e0e0e0',
    bgBottom: '#ffffff',
    latitude: 39.9,
    longitude: 116.4,
    projection: 'perspective',
    showEdges: true,
    shadows: true,
    shadowQuality: 4096,
    shadowBias: -0.0001,
    shadowRadius: 1,
    ambientIntensity: 1.0,
    ambientColor: '#ffffff',
    brightness: 5
};

export function useSettings() {
    const [settings, setSettings] = useState<ViewerSettings>(DEFAULT_SETTINGS);

    // Load settings on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem(SETTINGS_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                setSettings(prev => ({ ...prev, ...parsed }));
            }
        } catch (e) {
            console.error('Failed to load settings', e);
        }
    }, []);

    const updateSettings = useCallback((newSettings: Partial<ViewerSettings>) => {
        setSettings(prev => {
            const updated = { ...prev, ...newSettings };
            try {
                // Merge with existing logic in localStorage to avoid overwriting other keys if any
                const currentStored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
                localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...currentStored, ...newSettings }));
            } catch (e) {
                console.error('Failed to save settings', e);
            }
            return updated;
        });
    }, []);

    return { settings, updateSettings };
}
