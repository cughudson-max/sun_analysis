import { useState, useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/UI/dialog';
import { Button } from '@/components/UI/button';
import { Input } from '@/components/UI/input';
import { LocateFixed, Loader2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface LocationMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLocationSelect: (lat: number, lng: number) => void;
  initialLocation?: { lat: number; lng: number };
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const GEOCODING_URL = 'https://nominatim.openstreetmap.org/search';
const DEFAULT_CENTER: [number, number] = [116.4074, 39.9042];

export function LocationMapDialog({
  open,
  onOpenChange,
  onLocationSelect,
  initialLocation,
}: LocationMapDialogProps) {
  const { t } = useTranslation();
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(
    initialLocation || null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [isLocating, setIsLocating] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  // 使用 Callback Ref 来确保 DOM 元素挂载后立即初始化地图
  const mapContainerRef = useCallback((node: HTMLDivElement | null) => {
    if (!open || !node || mapRef.current) return;

    const center = initialLocation
      ? [initialLocation.lng, initialLocation.lat]
      : DEFAULT_CENTER;

    const map = new maplibregl.Map({
      container: node,
      style: MAP_STYLE,
      center: center as [number, number],
      zoom: 12,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    mapRef.current = map;

    const marker = new maplibregl.Marker({
      color: '#ef4444',
      scale: 1.2,
    })
      .setLngLat(center as [number, number])
      .addTo(map);

    markerRef.current = marker;

    map.on('click', (e) => {
      const { lng, lat } = e.lngLat;
      setSelectedLocation({ lat, lng });
      marker.setLngLat([lng, lat]);
    });

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(node);
    
    (map as any)._resizeObserver = resizeObserver;

  }, [open, initialLocation]);

  const getUserLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        if (mapRef.current) {
          mapRef.current.flyTo({
            center: [longitude, latitude],
            zoom: 14,
          });
        }
        setSelectedLocation({ lat: latitude, lng: longitude });
        markerRef.current?.setLngLat([longitude, latitude]);
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
      }
    );
  }, []);

  const searchLocation = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const response = await fetch(
        `${GEOCODING_URL}?q=${encodeURIComponent(query)}&format=json&limit=5`,
        { headers: { 'Accept': 'application/json' } }
      );
      const data: NominatimResult[] = await response.json();
      setSearchResults(data);
      setShowSearchResults(true);
    } catch {
      setSearchResults([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        searchLocation(searchQuery);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchLocation]);

  useEffect(() => {
    if (!open) return;
    
    // 如果地图已经初始化了，则处理可能的位置更新
    if (mapRef.current) {
      if (initialLocation) {
        mapRef.current.flyTo({
          center: [initialLocation.lng, initialLocation.lat],
          zoom: 12,
        });
        markerRef.current?.setLngLat([initialLocation.lng, initialLocation.lat]);
        setSelectedLocation(initialLocation);
      } else {
        getUserLocation();
      }
    }
  }, [open, initialLocation, getUserLocation]);

  useEffect(() => {
    if (open) return;
    if (mapRef.current) {
      const resizeObserver = (mapRef.current as any)._resizeObserver as ResizeObserver | undefined;
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      mapRef.current.remove();
      mapRef.current = null;
    }
    markerRef.current = null;
  }, [open]);

  const handleSearchSelect = useCallback((result: NominatimResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [lng, lat],
        zoom: 14,
      });
    }
    setSelectedLocation({ lat, lng });
    markerRef.current?.setLngLat([lng, lat]);
    setSearchQuery(result.display_name.split(',')[0]);
    setShowSearchResults(false);
    setSearchResults([]);
  }, []);

  const handleConfirm = useCallback(() => {
    if (selectedLocation) {
      onLocationSelect(selectedLocation.lat, selectedLocation.lng);
      onOpenChange(false);
    }
  }, [selectedLocation, onLocationSelect, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[98vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pb-2">
          <DialogTitle className="uppercase text-base font-bold">{t.location.title}</DialogTitle>
        </DialogHeader>

        <div className="relative w-full h-[460px] p-2 bg-background overflow-hidden">
          <div
            ref={mapContainerRef}
            className="w-full border h-full cursor-grab relative"
            style={{ zIndex: 0 }}
          />

          {/* Search Box - Top Left */}
          <div className="absolute top-4 left-4 w-64 z-10">
            <div className="relative bg-background rounded-md shadow-sm">
              <Input
                placeholder={t.location.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 text-sm bg-background/90 backdrop-blur-sm border-muted"
                onFocus={() => setShowSearchResults(true)}
              />
            </div>
            {showSearchResults && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md z-50 max-h-48 overflow-y-auto">
                {searchResults.map((result, index) => (
                  <button
                    key={index}
                    onClick={() => handleSearchSelect(result)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted cursor-pointer"
                  >
                    {result.display_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Locate Button - Bottom Right above navigation */}
          <div className="absolute top-28 right-4 z-10">
            <Button
              variant="secondary"
              className="h-8 w-8 backdrop-blur-md border border-gray-300 text-foreground bg-white hover:bg-gray-100 shadow-md"
              onClick={getUserLocation}
              disabled={isLocating}
              title={t.location.currentLocation}
            >
              {isLocating ? (
                <Loader2 className="w-4 h-4 animate-spin text-black" />
              ) : (
                <LocateFixed className="w-4 h-4 text-black" />
              )}
            </Button>
          </div>
        </div>

          <DialogFooter className="lex justify-end gap-2 py-6 border-t">
            <div className="flex items-center justify-end gap-2">
              <Button className='h-8 px-4 uppercase' variant="outline" onClick={() => onOpenChange(false)}>
                {t.common.cancel}
              </Button>
              <Button className='h-8 px-4 uppercase' onClick={handleConfirm}>
                {t.common.confirm}
              </Button>
            </div>
          </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
