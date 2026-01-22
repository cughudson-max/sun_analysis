import { useState, useEffect, useCallback } from 'react';

export type DisplayMode = 'shade' | 'shadeWithEdge' | 'pen' | 'edge' | 'wireframe';

export interface ViewerSettings {
    bgTop: string;
    bgBottom: string;
    latitude: number;
    longitude: number;
    timeZone?: string;
    mergeGeometry: boolean;
    loadMultiFile: boolean;
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
    mergeGeometry: false,
    loadMultiFile: false,
    projection: 'perspective',
    displayMode: 'shadeWithEdge',
    shadows: false,
    shadowQuality: 4096,
    shadowBias: -0.0001,
    shadowRadius: 1,
    ambientIntensity: 1.0,
    ambientColor: '#ffffff',
    brightness: 5,
    files3dm: []
};

export function useSettings() {
    const [settings, setSettings] = useState<ViewerSettings>(DEFAULT_SETTINGS);
    const [configLoaded, setConfigLoaded] = useState(false);

    useEffect(() => {
        const loadConfig = async () => {
            try {
                const response = await fetch(`${import.meta.env.BASE_URL}config.json`);
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
                            mergeGeometry: config.MergeGeometry ?? prev.mergeGeometry,
                            loadMultiFile: config.LoadMultiFile ?? prev.loadMultiFile,
                            files3dm: config['3dm'] ?? []
                        }));
                    }
                }
            } catch (e) {
                console.error('Failed to load config.json', e);
            } finally {
                setConfigLoaded(true);
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

    return { settings, updateSettings, configLoaded };
}
