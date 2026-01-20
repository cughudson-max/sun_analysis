import { useState, useEffect, useCallback } from 'react';

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
    files3dm?: string[];
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
    month: new Date().getMonth() + 1,
    day: new Date().getDate(),
    hour: new Date().getHours() + new Date().getMinutes() / 60,
    files3dm: []
};

export function useSettings() {
    const [settings, setSettings] = useState<ViewerSettings>(DEFAULT_SETTINGS);

    useEffect(() => {
        const loadConfig = async () => {
            try {
                const response = await fetch('/config.json');
                if (response.ok) {
                    const config = await response.json();
                    
                    if (config) {
                        setSettings(prev => ({
                            ...prev,
                            brightness: config.brightness ?? prev.brightness,
                            ambientIntensity: config.ambientIntensity ?? prev.ambientIntensity,
                            ambientColor: config.ambientColor ?? prev.ambientColor,
                            bgTop: config.topColor ?? prev.bgTop,
                            bgBottom: config.bottomColor ?? prev.bgBottom,
                            shadows: config.EnabledShadow ?? prev.shadows,
                            files3dm: config['3dm'] ?? []
                        }));
                    }
                }
            } catch (e) {
                console.error('Failed to load config.json', e);
            }
        };

        loadConfig();
    }, []);

    const updateSettings = useCallback((newSettings: Partial<ViewerSettings>) => {
        setSettings(prev => {
            const updated = { ...prev, ...newSettings };
            return updated;
        });
    }, []);

    return { settings, updateSettings };
}
