'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useTourStore } from '@/store/tour';

interface UseGeolocationOptions {
    enableHighAccuracy?: boolean;
    updateInterval?: number; // ms
    proximityThreshold?: number; // meters
}

interface GeolocationState {
    isTracking: boolean;
    error: string | null;
    accuracy: number | null;
}

export function useGeolocation(options: UseGeolocationOptions = {}) {
    const {
        enableHighAccuracy = true,
        updateInterval = 5000,
        proximityThreshold = 50,
    } = options;

    const {
        currentLocation,
        updateLocation,
        route,
        status,
        setStatus,
        isDemoMode
    } = useTourStore();

    const watchIdRef = useRef<number | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    // Check if user is near the current POI
    const checkProximity = useCallback(async (lat: number, lng: number) => {
        const currentStop = route.stops[route.currentStopIndex];
        if (!currentStop || status !== 'traveling') return;

        try {
            const response = await fetch(`http://localhost:8000/api/tour/proximity-check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    current_location: [lat, lng],
                    poi_location: currentStop.coordinates,
                    threshold: proximityThreshold,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                if (data.is_near) {
                    // Auto-transition to POI state when near
                    setStatus('poi');
                }
            }
        } catch (error) {
            // Fallback: simple distance check
            const latDiff = Math.abs(currentStop.coordinates[0] - lat);
            const lngDiff = Math.abs(currentStop.coordinates[1] - lng);

            // Rough check: ~0.0005 degrees ≈ 50 meters
            if (latDiff < 0.0005 && lngDiff < 0.0005) {
                setStatus('poi');
            }
        }
    }, [route.stops, route.currentStopIndex, status, setStatus, proximityThreshold]);

    // Handle position update
    const handlePosition = useCallback((position: GeolocationPosition) => {
        const { latitude, longitude, accuracy } = position.coords;

        updateLocation(latitude, longitude);

        // Check if near POI
        if (status === 'traveling') {
            checkProximity(latitude, longitude);
        }
    }, [updateLocation, status, checkProximity]);

    // Handle geolocation error - silent since we have LocationSimulator
    const handleError = useCallback((error: GeolocationPositionError) => {
        // Just log, don't show error to user since simulator works without GPS
        console.warn('Geolocation unavailable (using simulator instead):', error.message);
    }, []);

    // Start tracking (real GPS - optional, simulator works without it)
    const startTracking = useCallback(() => {
        if (!navigator.geolocation) {
            console.warn('Geolocation not supported - use Location Simulator');
            return;
        }

        // Get initial position (silently fail if unavailable)
        navigator.geolocation.getCurrentPosition(handlePosition, handleError, {
            enableHighAccuracy,
        });

        // Watch for updates
        watchIdRef.current = navigator.geolocation.watchPosition(
            handlePosition,
            handleError,
            {
                enableHighAccuracy,
                maximumAge: updateInterval,
                timeout: 10000,
            }
        );
    }, [handlePosition, handleError, enableHighAccuracy, updateInterval]);

    // Stop tracking
    const stopTracking = useCallback(() => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        if (intervalRef.current !== null) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    // Demo mode: simulate walking
    const simulateWalking = useCallback(() => {
        const currentStop = route.stops[route.currentStopIndex];
        if (!currentStop) return;

        // If we have a current location, move towards the POI
        if (currentLocation) {
            const [currentLat, currentLng] = currentLocation;
            const [targetLat, targetLng] = currentStop.coordinates;

            // Move 10% closer to target each update
            const newLat = currentLat + (targetLat - currentLat) * 0.1;
            const newLng = currentLng + (targetLng - currentLng) * 0.1;

            updateLocation(newLat, newLng);

            // Check if we're close enough
            const distance = Math.sqrt(
                Math.pow(targetLat - newLat, 2) + Math.pow(targetLng - newLng, 2)
            );

            if (distance < 0.0002 && status === 'traveling') {
                setStatus('poi');
            }
        } else {
            // Start near Providence center
            updateLocation(41.8240, -71.4128);
        }
    }, [route.stops, route.currentStopIndex, currentLocation, updateLocation, status, setStatus]);

    // Auto-start tracking when tour starts
    useEffect(() => {
        if (status === 'traveling' && !isDemoMode) {
            startTracking();
        } else if (status === 'traveling' && isDemoMode) {
            // Demo mode: simulate walking every 2 seconds
            intervalRef.current = setInterval(simulateWalking, 2000);
        }

        return () => {
            stopTracking();
        };
    }, [status, isDemoMode, startTracking, stopTracking, simulateWalking]);

    return {
        currentLocation,
        startTracking,
        stopTracking,
        isTracking: watchIdRef.current !== null || intervalRef.current !== null,
    };
}
