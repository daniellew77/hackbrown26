'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';

import 'mapbox-gl/dist/mapbox-gl.css';

// Default to Providence, RI
const DEFAULT_CENTER: [number, number] = [-71.4128, 41.8240];

interface LandingMapProps {
    onCityFound?: (city: string) => void;
}

export default function LandingMap({ onCityFound }: LandingMapProps) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<mapboxgl.Map | null>(null);
    // Initialize map with default center immediately
    const [userLocation, setUserLocation] = useState<[number, number]>(DEFAULT_CENTER);
    const [hasUserLocation, setHasUserLocation] = useState(false);

    // Get user location on mount
    useEffect(() => {
        if (!('geolocation' in navigator)) return;

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const newLoc: [number, number] = [position.coords.longitude, position.coords.latitude];
                setUserLocation(newLoc);
                setHasUserLocation(true);

                // Reverse Geocode to get City Name
                try {
                    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
                    if (token) {
                        const response = await fetch(
                            `https://api.mapbox.com/geocoding/v5/mapbox.places/${newLoc[0]},${newLoc[1]}.json?types=place&access_token=${token}`
                        );
                        const data = await response.json();
                        if (data.features && data.features.length > 0) {
                            const city = data.features[0].text;
                            if (onCityFound) onCityFound(city);
                        }
                    }
                } catch (error) {
                    console.error('Error fetching city name:', error);
                }
            },
            (error) => {
                console.log('Location access denied or error:', error);
                if (onCityFound) onCityFound("Providence"); // Default fallback
            }
        );
    }, [onCityFound]);

    // Initialize Map
    useEffect(() => {
        if (!mapContainer.current) return;
        if (map.current) {
            // If map exists and we just got user location, fly to it
            if (hasUserLocation) {
                map.current.flyTo({
                    center: userLocation,
                    zoom: 15.5,
                    pitch: 45,
                    bearing: -17.6,
                    essential: true // animation will happen even if user has 'reduced motion' setting
                });
            }
            return;
        }

        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
        if (!token) {
            console.error('Mapbox token not found');
            return;
        }
        mapboxgl.accessToken = token;

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: 'mapbox://styles/mapbox/dark-v11',
            center: DEFAULT_CENTER, // Start with default
            zoom: 15.5,
            pitch: 45,
            bearing: -17.6,
            antialias: true,
            interactive: false, // Disable interaction for background map
            attributionControl: false // Hide attribution for cleaner look (ensure legal compliance if needed)
        });

        map.current.on('load', () => {
            if (!map.current) return;

            // Add 3D buildings
            const layers = map.current.getStyle()?.layers;
            const labelLayerId = layers?.find(
                (layer) => layer.type === 'symbol' && layer.layout?.['text-field']
            )?.id;

            map.current.addLayer(
                {
                    'id': 'add-3d-buildings',
                    'source': 'composite',
                    'source-layer': 'building',
                    'filter': ['==', 'extrude', 'true'],
                    'type': 'fill-extrusion',
                    'minzoom': 15,
                    'paint': {
                        'fill-extrusion-color': '#aaa',
                        'fill-extrusion-height': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            15,
                            0,
                            15.05,
                            ['get', 'height']
                        ],
                        'fill-extrusion-base': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            15,
                            0,
                            15.05,
                            ['get', 'min_height']
                        ],
                        'fill-extrusion-opacity': 0.6
                    }
                },
                labelLayerId
            );

            // Add sky layer for atmosphere
            map.current.setFog({
                'range': [0.5, 10],
                'color': '#2a2a2a', // lower atmosphere
                'high-color': '#111', // upper atmosphere
                'horizon-blend': 0.1, // atmosphere thickness
                'space-color': '#000000', // background color
                'star-intensity': 0.15 // background star brightness
            });
            // Orbital Animation
            function rotateCamera(timestamp: number) {
                if (!map.current) return;
                // divide by 300 to slow it down (was 100)
                map.current.rotateTo((timestamp / 300) % 360, { duration: 0 });
                requestAnimationFrame(rotateCamera);
            }
            requestAnimationFrame(rotateCamera);
        });

        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, [hasUserLocation]);

    return (
        <div
            ref={mapContainer}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: -1,
                opacity: 0.6, // Slight transparency to blend with background
            }}
        />
    );
}
