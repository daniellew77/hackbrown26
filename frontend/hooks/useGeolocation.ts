'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useTourStore } from '@/store/tour';

interface UseGeolocationOptions {
    enableHighAccuracy?: boolean;
    updateInterval?: number; // ms
    proximityThreshold?: number; // meters
}

export function useGeolocation(options: UseGeolocationOptions = {}) {
    const {
        enableHighAccuracy = true,
        updateInterval = 5000,
        proximityThreshold = 50,
    } = options;

    // Only subscribe to primitives that control flow, not reactive data
    const status = useTourStore((state) => state.status);
    const isDemoMode = useTourStore((state) => state.isDemoMode);
    const currentLocation = useTourStore((state) => state.currentLocation);

    const watchIdRef = useRef<number | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    // Handle position update - use getState() inside to avoid stale closures
    const handlePosition = useCallback((position: GeolocationPosition) => {
        const { latitude, longitude } = position.coords;
        const store = useTourStore.getState();

        store.updateLocation(latitude, longitude);

        // Check if near POI
        if (store.status === 'traveling') {
            const currentStop = store.route.stops[store.route.currentStopIndex];
            if (currentStop) {
                const latDiff = Math.abs(currentStop.coordinates[0] - latitude);
                const lngDiff = Math.abs(currentStop.coordinates[1] - longitude);

                // ~0.0005 degrees ≈ 50 meters
                if (latDiff < 0.0005 && lngDiff < 0.0005) {
                    store.setStatus('poi');
                }
            }
        }
    }, []); // No dependencies - uses getState() for fresh values

    // Handle geolocation error - silent since we have LocationSimulator
    const handleError = useCallback((error: GeolocationPositionError) => {
        console.warn('Geolocation unavailable (using simulator instead):', error.message);
    }, []);

    // Start tracking (real GPS)
    const startTracking = useCallback(() => {
        if (!navigator.geolocation) {
            console.warn('Geolocation not supported - use Location Simulator');
            return;
        }

        // Get initial position
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

    // Demo mode: simulate walking - uses getState() to avoid dependency issues
    const simulateWalking = useCallback(() => {
        const store = useTourStore.getState();
        const currentStop = store.route.stops[store.route.currentStopIndex];
        if (!currentStop) return;

        const currentLoc = store.currentLocation;

        if (currentLoc) {
            const [currentLat, currentLng] = currentLoc;
            const [targetLat, targetLng] = currentStop.coordinates;

            // Move 10% closer to target each update
            const newLat = currentLat + (targetLat - currentLat) * 0.1;
            const newLng = currentLng + (targetLng - currentLng) * 0.1;

            store.updateLocation(newLat, newLng);

            // Check if we're close enough
            const distance = Math.sqrt(
                Math.pow(targetLat - newLat, 2) + Math.pow(targetLng - newLng, 2)
            );

            if (distance < 0.0002 && store.status === 'traveling') {
                store.setStatus('poi');
            }
        } else {
            // Start near Providence center
            store.updateLocation(41.8240, -71.4128);
        }
    }, []); // No dependencies - uses getState() for fresh values

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
