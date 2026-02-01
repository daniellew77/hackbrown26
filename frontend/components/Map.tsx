'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useTourStore, POIStop } from '@/store/tour';
import styles from './Map.module.css';

// Mapbox access token - in production, use env variable
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || 'pk.eyJ1IjoibWFwYm94LWRlbW8iLCJhIjoiY2xnNzB4c2FpMDFvdjNtczV4dW9ieTFuZCJ9.gTZ0cBHCBN93X1OLflTgFw';

// Theme colors for markers
const THEME_COLORS: Record<string, string> = {
    historical: '#d4a574',
    art: '#ec4899',
    ghost: '#6ee7b7',
    default: '#6366f1',
};

interface MapProps {
    className?: string;
}

export default function Map({ className }: MapProps) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<mapboxgl.Map | null>(null);

    const { route, preferences, currentLocation, status } = useTourStore();
    const [mapLoaded, setMapLoaded] = useState(false);

    // Initialize map
    useEffect(() => {
        if (!mapContainer.current || map.current) return;

        mapboxgl.accessToken = MAPBOX_TOKEN;

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: 'mapbox://styles/mapbox/dark-v11',
            center: [-71.4128, 41.8240], // Providence, RI
            zoom: 16, // Higher zoom to see 3D buildings better
            pitch: 60, // More dramatic tilt for 3D effect
            bearing: -17.6,
            antialias: true, // Smoother 3D rendering
        });

        map.current.on('load', () => {
            setMapLoaded(true);

            // Add 3D buildings layer with enhanced lighting
            const layers = map.current!.getStyle().layers;
            const labelLayerId = layers?.find(
                (layer) => layer.type === 'symbol' && layer.layout?.['text-field']
            )?.id;

            // Add ambient light for better 3D visualization
            map.current!.setLights([
                {
                    id: 'ambient',
                    type: 'ambient',
                    properties: {
                        color: 'rgba(255, 255, 255, 0.5)',
                        intensity: 0.4,
                    },
                },
                {
                    id: 'directional',
                    type: 'directional',
                    properties: {
                        color: 'rgba(255, 255, 255, 0.8)',
                        intensity: 0.6,
                        direction: [200, 40],
                        'cast-shadows': true,
                        'shadow-intensity': 0.3,
                    },
                },
            ]);

            map.current!.addLayer(
                {
                    id: '3d-buildings',
                    source: 'composite',
                    'source-layer': 'building',
                    filter: ['==', 'extrude', 'true'],
                    type: 'fill-extrusion',
                    minzoom: 12,
                    paint: {
                        'fill-extrusion-color': [
                            'interpolate',
                            ['linear'],
                            ['get', 'height'],
                            0, '#1a1a2e',
                            50, '#2d2d4a',
                            100, '#3d3d5c',
                        ],
                        'fill-extrusion-height': ['get', 'height'],
                        'fill-extrusion-base': ['get', 'min_height'],
                        'fill-extrusion-opacity': 0.9,
                    },
                },
                labelLayerId
            );
        });



        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, []);

    // Update POI markers using native Mapbox layers (not DOM markers)
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        const themeColor = THEME_COLORS[preferences.theme] || THEME_COLORS.default;

        // Create GeoJSON data for POI stops
        const poiGeoJson: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: route.stops.map((stop, index) => ({
                type: 'Feature' as const,
                properties: {
                    id: stop.id,
                    name: stop.name,
                    address: stop.address,
                    number: index + 1,
                    isCurrent: index === route.currentStopIndex,
                    isPast: index < route.currentStopIndex,
                },
                geometry: {
                    type: 'Point' as const,
                    coordinates: [stop.coordinates[1], stop.coordinates[0]],
                },
            })),
        };

        // Add or update POI source
        if (map.current.getSource('pois')) {
            (map.current.getSource('pois') as mapboxgl.GeoJSONSource).setData(poiGeoJson);
        } else {
            map.current.addSource('pois', {
                type: 'geojson',
                data: poiGeoJson,
            });

            // Circle layer for POI markers
            map.current.addLayer({
                id: 'poi-circles',
                type: 'circle',
                source: 'pois',
                paint: {
                    'circle-radius': 18,
                    'circle-color': [
                        'case',
                        ['get', 'isCurrent'], themeColor,
                        '#1a1a2e'
                    ],
                    'circle-stroke-width': 3,
                    'circle-stroke-color': themeColor,
                    'circle-opacity': [
                        'case',
                        ['get', 'isPast'], 0.5,
                        1
                    ],
                },
            });

            // Text labels for POI numbers
            map.current.addLayer({
                id: 'poi-labels',
                type: 'symbol',
                source: 'pois',
                layout: {
                    'text-field': ['to-string', ['get', 'number']],
                    'text-size': 14,
                    'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
                    'text-allow-overlap': true,
                },
                paint: {
                    'text-color': [
                        'case',
                        ['get', 'isCurrent'], '#ffffff',
                        '#ffffff'
                    ],
                },
            });

            // Click handler for POI popups
            map.current.on('click', 'poi-circles', (e) => {
                if (!e.features?.[0]) return;
                const props = e.features[0].properties;
                const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;

                new mapboxgl.Popup({ offset: 25 })
                    .setLngLat(coords as [number, number])
                    .setHTML(`<h3 style="margin:0 0 4px;font-size:14px;color:black;">${props?.name}</h3><p style="margin:0;font-size:12px;opacity:0.7;color:black;">${props?.address}</p>`)
                    .addTo(map.current!);
            });

            // Cursor change on hover
            map.current.on('mouseenter', 'poi-circles', () => {
                map.current!.getCanvas().style.cursor = 'pointer';
            });
            map.current.on('mouseleave', 'poi-circles', () => {
                map.current!.getCanvas().style.cursor = '';
            });
        }

        // Update route line based on tour status
        if (route.stops.length > 1) {
            let coordinates: number[][] = [];

            if (status === 'initial') {
                // Before tour starts: show overview path connecting all stops
                coordinates = route.stops.map(stop => [stop.coordinates[1], stop.coordinates[0]]);
            } else if (route.currentPath && route.currentPath.length > 0) {
                // During tour: show detailed Google Maps walking path to current stop
                // Mapbox expects [lng, lat], but store has [lat, lng]
                coordinates = route.currentPath.map(p => [p[1], p[0]]);
            } else {
                // Fallback when no path available: straight line to current stop
                const currentStop = route.stops[route.currentStopIndex];
                if (currentLocation && currentStop) {
                    coordinates = [
                        [currentLocation[1], currentLocation[0]],
                        [currentStop.coordinates[1], currentStop.coordinates[0]]
                    ];
                }
            }

            if (coordinates.length > 0) {
                if (map.current.getSource('route')) {
                    (map.current.getSource('route') as mapboxgl.GeoJSONSource).setData({
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            coordinates,
                        },
                    });
                } else {
                    map.current.addSource('route', {
                        type: 'geojson',
                        data: {
                            type: 'Feature',
                            properties: {},
                            geometry: {
                                type: 'LineString',
                                coordinates,
                            },
                        },
                    });

                    map.current.addLayer({
                        id: 'route',
                        type: 'line',
                        source: 'route',
                        layout: {
                            'line-join': 'round',
                            'line-cap': 'round',
                        },
                        paint: {
                            'line-color': themeColor,
                            'line-width': 5,
                            'line-opacity': 0.8,
                        },
                    }, 'poi-circles'); // Place below POI markers
                }
            }
        }

        // Fit map to show all stops
        if (route.stops.length > 0) {
            const bounds = new mapboxgl.LngLatBounds();
            route.stops.forEach(stop => {
                bounds.extend([stop.coordinates[1], stop.coordinates[0]]);
            });
            map.current.fitBounds(bounds, { padding: 80, duration: 1000 });
        }
    }, [route.stops, route.currentStopIndex, route.currentPath, preferences.theme, mapLoaded, status, currentLocation]);

    // Update user location using native circle layer
    useEffect(() => {
        if (!map.current || !mapLoaded || !currentLocation) return;

        const userGeoJson: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'Point',
                    coordinates: [currentLocation[1], currentLocation[0]],
                },
            }],
        };

        if (map.current.getSource('user-location')) {
            (map.current.getSource('user-location') as mapboxgl.GeoJSONSource).setData(userGeoJson);
        } else {
            map.current.addSource('user-location', {
                type: 'geojson',
                data: userGeoJson,
            });

            // Outer glow circle
            map.current.addLayer({
                id: 'user-location-glow',
                type: 'circle',
                source: 'user-location',
                paint: {
                    'circle-radius': 20,
                    'circle-color': '#3b82f6',
                    'circle-opacity': 0.3,
                },
            });

            // Inner dot
            map.current.addLayer({
                id: 'user-location-dot',
                type: 'circle',
                source: 'user-location',
                paint: {
                    'circle-radius': 8,
                    'circle-color': '#3b82f6',
                    'circle-stroke-width': 3,
                    'circle-stroke-color': '#ffffff',
                },
            });
        }
    }, [currentLocation, mapLoaded]);

    // Pitch control handler
    const handlePitchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newPitch = parseInt(e.target.value);
        map.current?.easeTo({ pitch: newPitch, duration: 200 });
    };

    // Bearing control handler  
    const handleBearingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newBearing = parseInt(e.target.value);
        map.current?.easeTo({ bearing: newBearing, duration: 200 });
    };

    // Reset view handler
    const resetView = () => {
        map.current?.easeTo({ pitch: 60, bearing: -17.6, zoom: 16, duration: 500 });
    };

    return (
        <div className={`${styles.mapContainer} ${className || ''}`}>
            <div ref={mapContainer} className={styles.map} />



            {!mapLoaded && (
                <div className={styles.loading}>
                    <div className={styles.loadingSpinner} />
                    <span>Loading map...</span>
                </div>
            )}
        </div>
    );
}
