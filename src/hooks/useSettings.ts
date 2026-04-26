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

const STORAGE_KEY = '3dm-viewer-settings';

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
    shadowQuality: 8196,
    shadowBias: -0.0001,
    shadowRadius: 1,
    ambientIntensity: 1.0,
    ambientColor: '#ffffff',
    brightness: 5,
    files3dm: []
};

const PERSIST_KEYS = ['bgTop', 'bgBottom', 'latitude', 'longitude'] as const;

function loadPersistedSettings(): Partial<ViewerSettings> {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return PERSIST_KEYS.reduce((acc, key) => {
                if (parsed[key] !== undefined) {
                    acc[key] = parsed[key];
                }
                return acc;
            }, {} as Partial<ViewerSettings>);
        }
    } catch (e) {
        console.error('Failed to load viewer settings from localStorage', e);
    }
    return {};
}

function savePersistedSettings(settings: ViewerSettings): void {
    try {
        const toSave = PERSIST_KEYS.reduce((acc, key) => {
            acc[key] = settings[key];
            return acc;
        }, {} as Record<string, unknown>);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
        console.error('Failed to save viewer settings to localStorage', e);
    }
}

export function useSettings() {
    const [settings, setSettings] = useState<ViewerSettings>({
        ...DEFAULT_SETTINGS,
        ...loadPersistedSettings()
    });
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

    useEffect(() => {
        if (configLoaded) {
            savePersistedSettings(settings);
        }
    }, [settings, configLoaded]);

    const updateSettings = useCallback((newSettings: Partial<ViewerSettings>) => {
        setSettings(prev => {
            const updated = { ...prev, ...newSettings };
            return updated;
        });
    }, []);

    return { settings, updateSettings, configLoaded };
}
