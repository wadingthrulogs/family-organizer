import { useEffect, useRef } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { Map as MapboxMap } from 'mapbox-gl';
import type { CongestionClass } from '../../types/commute';

const CONGESTION_COLOR: Record<CongestionClass, string> = {
  low:      '#22c55e',
  moderate: '#eab308',
  heavy:    '#f97316',
  severe:   '#ef4444',
  unknown:  '#94a3b8',
};

function decodePolyline(str: string, precision = 6): [number, number][] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const factor = Math.pow(10, precision);
  const coords: [number, number][] = [];

  while (index < str.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coords.push([lng / factor, lat / factor]);
  }

  return coords;
}

interface Props {
  polyline: string;
  congestion?: CongestionClass[];
  mapboxToken: string;
  height?: number;
}

export default function CommuteMap({ polyline, congestion, mapboxToken, height = 110 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container || !mapboxToken || !polyline) return;

    (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;
      if (cancelled || !containerRef.current) return;

      mapboxgl.accessToken = mapboxToken;

      const coords = decodePolyline(polyline, 6);
      if (coords.length < 2) return;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        interactive: false,
        attributionControl: false,
        center: coords[Math.floor(coords.length / 2)],
        zoom: 12,
      });
      mapRef.current = map;

      map.on('load', () => {
        const features = [];
        for (let i = 0; i < coords.length - 1; i++) {
          const klass: CongestionClass = (congestion?.[i] ?? 'unknown') as CongestionClass;
          features.push({
            type: 'Feature' as const,
            properties: { congestion: klass },
            geometry: {
              type: 'LineString' as const,
              coordinates: [coords[i], coords[i + 1]],
            },
          });
        }

        map.addSource('route', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features },
        });

        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-width': 4,
            'line-color': [
              'match',
              ['get', 'congestion'],
              'low',      CONGESTION_COLOR.low,
              'moderate', CONGESTION_COLOR.moderate,
              'heavy',    CONGESTION_COLOR.heavy,
              'severe',   CONGESTION_COLOR.severe,
              CONGESTION_COLOR.unknown,
            ],
          },
        });

        const lngs = coords.map((c) => c[0]);
        const lats = coords.map((c) => c[1]);
        const bounds: [[number, number], [number, number]] = [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ];
        map.fitBounds(bounds, { padding: 12, animate: false });
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [polyline, congestion, mapboxToken]);

  return <div ref={containerRef} style={{ height, width: '100%' }} className="rounded-lg overflow-hidden" />;
}
