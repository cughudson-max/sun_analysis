import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import SunCalc from 'suncalc';
import { ViewerSettings } from './useSettings';

function getNowParts(timeZone?: string) {
    const now = new Date();
    if (!timeZone) {
        return {
            year: now.getFullYear(),
            month: now.getMonth() + 1,
            day: now.getDate(),
            hour: now.getHours(),
            minute: now.getMinutes(),
            second: now.getSeconds()
        };
    }

    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const parts = dtf.formatToParts(now);
    const get = (type: string) => parts.find(p => p.type === type)?.value;
    const year = Number(get('year'));
    const month = Number(get('month'));
    const day = Number(get('day'));
    const hour = Number(get('hour'));
    const minute = Number(get('minute'));
    const second = Number(get('second'));
    if ([year, month, day, hour, minute, second].some(n => Number.isNaN(n))) {
        return {
            year: now.getFullYear(),
            month: now.getMonth() + 1,
            day: now.getDate(),
            hour: now.getHours(),
            minute: now.getMinutes(),
            second: now.getSeconds()
        };
    }
    return { year, month, day, hour, minute, second };
}

function getTimeZoneOffsetMinutes(timeZone: string, date: Date) {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const parts = dtf.formatToParts(date);
    const get = (type: string) => parts.find(p => p.type === type)?.value;
    const year = Number(get('year'));
    const month = Number(get('month'));
    const day = Number(get('day'));
    const hour = Number(get('hour'));
    const minute = Number(get('minute'));
    const second = Number(get('second'));
    const asUTC = Date.UTC(year, month - 1, day, hour, minute, second);
    return (asUTC - date.getTime()) / 60000;
}

function zonedTimeToUtc(
    {
        year,
        month,
        day,
        hour,
        minute
    }: { year: number; month: number; day: number; hour: number; minute: number },
    timeZone: string
) {
    const guessUTC = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
    let offset = getTimeZoneOffsetMinutes(timeZone, guessUTC);
    let adjusted = new Date(guessUTC.getTime() - offset * 60000);
    const offset2 = getTimeZoneOffsetMinutes(timeZone, adjusted);
    if (offset2 !== offset) {
        adjusted = new Date(guessUTC.getTime() - offset2 * 60000);
    }
    return adjusted;
}

function buildSunDate(settings: ViewerSettings) {
    const nowParts = getNowParts(settings.timeZone);
    const year = nowParts.year;
    const month = settings.month ?? nowParts.month;
    const day = settings.day ?? nowParts.day;
    const hourValue = settings.hour ?? (nowParts.hour + nowParts.minute / 60);

    let h = Math.floor(hourValue);
    let m = Math.round((hourValue - h) * 60);
    if (m >= 60) {
        m = 0;
        h += 1;
    }
    h = Math.max(0, Math.min(23, h));

    if (settings.timeZone) {
        return zonedTimeToUtc({ year, month, day, hour: h, minute: m }, settings.timeZone);
    }

    return new Date(year, month - 1, day, h, m, 0, 0);
}

export function useLights(
    sceneRef: React.MutableRefObject<THREE.Scene | null>,
    settings: ViewerSettings
) {
    const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
    const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
    const groundRef = useRef<THREE.Mesh | null>(null);
    const shadowFitCameraRef = useRef<THREE.OrthographicCamera | null>(null);

    const isActuallyVisible = (obj: THREE.Object3D) => {
        let cur: THREE.Object3D | null = obj;
        while (cur) {
            if (!cur.visible) return false;
            cur = cur.parent;
        }
        return true;
    };

    const computeSceneBox = () => {
        const box = new THREE.Box3();
        let hasObjects = false;
        const scene = sceneRef.current;
        if (!scene) return { box, hasObjects };

        scene.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) return;
            if (!isActuallyVisible(child)) return;
            if (child.name === 'Ground') return;
            if (child.name === 'selection-box') return;
            if (child.name === 'HighlightLine') return;
            if (child.name === 'HighlightPoint') return;
            if (child instanceof THREE.GridHelper) return;
            if (child instanceof THREE.AxesHelper) return;

            box.expandByObject(child);
            hasObjects = true;
        });

        if (!hasObjects) {
            const defaultSize = 1000;
            box.min.set(-defaultSize, -defaultSize, 0);
            box.max.set(defaultSize, defaultSize, 0);
        }

        return { box, hasObjects };
    };

    const updateShadowFrustum = () => {
        const dirLight = dirLightRef.current;
        const scene = sceneRef.current;
        if (!dirLight || !scene || !settings.shadows) return;

        const { box } = computeSceneBox();
        if (box.isEmpty()) return;

        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        const now = buildSunDate(settings);
        const times = SunCalc.getPosition(now, settings.latitude, settings.longitude);
        const phi = times.altitude;
        const theta = times.azimuth;
        const sunDir = new THREE.Vector3(
            Math.cos(phi) * -Math.sin(theta),
            Math.cos(phi) * -Math.cos(theta),
            Math.sin(phi)
        );
        if (sunDir.lengthSq() < 1e-8) sunDir.set(1, -1, 1);
        sunDir.normalize();

        const distance = Math.max(1000, maxDim * 3);

        const lightPos = center.clone().addScaledVector(sunDir, distance);
        dirLight.target.position.copy(center);
        dirLight.position.copy(lightPos);
        dirLight.target.updateMatrixWorld();
        dirLight.updateMatrixWorld();

        const upZ = new THREE.Vector3(0, 0, 1);
        const upY = new THREE.Vector3(0, 1, 0);
        const up = Math.abs(sunDir.dot(upZ)) > 0.95 ? upY : upZ;

        if (!shadowFitCameraRef.current) {
            shadowFitCameraRef.current = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1);
        }
        const shadowFitCamera = shadowFitCameraRef.current;
        shadowFitCamera.position.copy(lightPos);
        shadowFitCamera.up.copy(up);
        shadowFitCamera.lookAt(center);
        shadowFitCamera.updateMatrixWorld(true);
        const viewMatrix = shadowFitCamera.matrixWorldInverse;
        const corners: THREE.Vector3[] = [
            new THREE.Vector3(box.min.x, box.min.y, box.min.z),
            new THREE.Vector3(box.min.x, box.min.y, box.max.z),
            new THREE.Vector3(box.min.x, box.max.y, box.min.z),
            new THREE.Vector3(box.min.x, box.max.y, box.max.z),
            new THREE.Vector3(box.max.x, box.min.y, box.min.z),
            new THREE.Vector3(box.max.x, box.min.y, box.max.z),
            new THREE.Vector3(box.max.x, box.max.y, box.min.z),
            new THREE.Vector3(box.max.x, box.max.y, box.max.z)
        ];

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;

        for (const c of corners) {
            c.applyMatrix4(viewMatrix);
            minX = Math.min(minX, c.x);
            maxX = Math.max(maxX, c.x);
            minY = Math.min(minY, c.y);
            maxY = Math.max(maxY, c.y);
            minZ = Math.min(minZ, c.z);
            maxZ = Math.max(maxZ, c.z);
        }

        const margin = Math.max(10, maxDim * 0.2);
        const shadowCam = dirLight.shadow.camera as THREE.OrthographicCamera;
        shadowCam.left = minX - margin;
        shadowCam.right = maxX + margin;
        shadowCam.bottom = minY - margin;
        shadowCam.top = maxY + margin;
        shadowCam.near = Math.max(0.1, -maxZ - margin);
        shadowCam.far = Math.max(shadowCam.near + 1, -minZ + margin);
        shadowCam.updateProjectionMatrix();

        dirLight.shadow.needsUpdate = true;
    };

    // Initialize Lights
    useEffect(() => {
        if (!sceneRef.current) return;
        const scene = sceneRef.current;

        const ambientLight = new THREE.AmbientLight(settings.ambientColor, settings.ambientIntensity);
        scene.add(ambientLight);
        ambientLightRef.current = ambientLight;

        // Directional
        const dirLight = new THREE.DirectionalLight(0xffffff, settings.brightness);
        dirLight.position.set(100, -100, 100);
        dirLight.castShadow = settings.shadows;
        
        dirLight.shadow.mapSize.width = settings.shadowQuality;
        dirLight.shadow.mapSize.height = settings.shadowQuality;
        dirLight.shadow.bias = settings.shadowBias;
        dirLight.shadow.normalBias = 0.02;
        dirLight.shadow.radius = settings.shadowRadius;
        
        const d = 100;
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;
        dirLight.shadow.camera.near = 0.1;
        dirLight.shadow.camera.far = 10000;

        scene.add(dirLight);
        scene.add(dirLight.target);
        dirLightRef.current = dirLight;

        return () => {
            scene.remove(ambientLight);
            scene.remove(dirLight);
            scene.remove(dirLight.target);
            if (groundRef.current) scene.remove(groundRef.current);
        };
    }, [sceneRef]); // Only run once on scene init

    // Update Lights based on Settings
    useEffect(() => {
        if (ambientLightRef.current) {
            ambientLightRef.current.intensity = settings.ambientIntensity;
            ambientLightRef.current.color.set(settings.ambientColor);
        }

        if (dirLightRef.current) {
            dirLightRef.current.intensity = settings.brightness;
            dirLightRef.current.castShadow = settings.shadows;
            dirLightRef.current.shadow.mapSize.width = settings.shadowQuality;
            dirLightRef.current.shadow.mapSize.height = settings.shadowQuality;
            dirLightRef.current.shadow.bias = settings.shadowBias;
            dirLightRef.current.shadow.radius = settings.shadowRadius;
            
            // Recreate shadow map if size changed
             if (dirLightRef.current.shadow.map) {
                dirLightRef.current.shadow.map.dispose();
                dirLightRef.current.shadow.map = null;
            }
        }
        
        if (settings.shadows) {
            updateGround();
            updateShadowFrustum();
        } else if (groundRef.current && sceneRef.current) {
             sceneRef.current.remove(groundRef.current);
             groundRef.current = null;
        }

    }, [settings]);

    // Sun Position
    useEffect(() => {
        if (!dirLightRef.current) return;
        updateShadowFrustum();
    }, [settings.latitude, settings.longitude, settings.timeZone, settings.month, settings.day, settings.hour]);

    const updateSunPosition = () => {
        updateShadowFrustum();
    };

    const updateGround = () => {
      if (!sceneRef.current) return;

      const { box } = computeSceneBox();
      
      const size = new THREE.Vector3();
      box.getSize(size);
      
      const maxDim = Math.max(size.x, size.y);
      const groundSize = Math.max(maxDim * 10, 10000);
      
      if (groundRef.current) {
          sceneRef.current.remove(groundRef.current);
          if (groundRef.current.geometry) groundRef.current.geometry.dispose();
      }
      
      const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
      const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.3, color: 0x000000 });
      const ground = new THREE.Mesh(groundGeometry, groundMaterial);
      ground.name = 'Ground';
      
      ground.position.set(0, 0, 0);
      ground.receiveShadow = true;
      
      sceneRef.current.add(ground);
      groundRef.current = ground;
    };

    return { dirLightRef, updateGround, updateSunPosition, updateShadowFrustum };
}
