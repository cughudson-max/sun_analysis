import { useState, useEffect, useCallback } from 'react';

const SETTINGS_KEY = '3dm-viewer-settings';

export type DisplayMode = 'shade' | 'shadeWithEdge' | 'wireframe';

export interface ViewerSettings {
    bgTop: string;
    bgBottom: string;
    latitude: number;
    longitude: number;
    projection: 'perspective' | 'orthographic';
    displayMode: DisplayMode;
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
    displayMode: 'shadeWithEdge',
    shadows: true,
    shadowQuality: 4096,
    shadowBias: -0.0001,
    shadowRadius: 1,
    ambientIntensity: 1.0,
    ambientColor: '#ffffff',
    brightness: 5,
    hour: 10.5
};

export function useSettings() {
    const [settings, setSettings] = useState<ViewerSettings>(DEFAULT_SETTINGS);

    useEffect(() => {
        try {
            const saved = localStorage.getItem(SETTINGS_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                setSettings(prev => {
                    let displayMode: DisplayMode = parsed.displayMode;
                    if (!displayMode) {
                        if (typeof parsed.showEdges === 'boolean') {
                            displayMode = parsed.showEdges ? 'shadeWithEdge' : 'shade';
                        } else {
                            displayMode = DEFAULT_SETTINGS.displayMode;
                        }
                    }
                    const { showEdges, ...rest } = parsed;
                    return { ...prev, ...rest, displayMode };
                });
            }
        } catch (e) {
            console.error('Failed to load settings', e);
        }
    }, []);

    const updateSettings = useCallback((newSettings: Partial<ViewerSettings>) => {
        setSettings(prev => {
            const updated = { ...prev, ...newSettings };
            try {
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
