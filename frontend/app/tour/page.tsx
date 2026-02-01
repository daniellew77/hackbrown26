'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useTourStore, selectCurrentStop, selectProgressCurrent, selectProgressTotal } from '@/store/tour';
import { useGeolocation } from '@/hooks/useGeolocation';
import TourStatus from '@/components/TourStatus';
import LocationSimulator from '@/components/LocationSimulator';
import NarrationCard from '@/components/NarrationCard';
import ChatInterface from '@/components/ChatInterface';
import styles from './page.module.css';

// Dynamic import for Map to avoid SSR issues with Mapbox
const Map = dynamic(() => import('@/components/Map'), {
    ssr: false,
    loading: () => (
        <div className={styles.mapPlaceholder}>
            <div className={styles.spinner} />
            <span>Loading map...</span>
        </div>
    ),
});

export default function TourPage() {
    const router = useRouter();
    const { tourId, status, preferences, route, setRoute, isLoading, error, setLoading, setError } = useTourStore();
    const currentStop = useTourStore(selectCurrentStop);
    const progressCurrent = useTourStore(selectProgressCurrent);
    const progressTotal = useTourStore(selectProgressTotal);

    // Enable geolocation tracking
    useGeolocation();

    // Fetch route on mount if not already loaded
    useEffect(() => {
        // Initialize location to Providence center for simulator
        if (!useTourStore.getState().currentLocation) {
            useTourStore.getState().updateLocation(41.8240, -71.4128);
        }

        if (route.stops.length === 0 && !isLoading) {
            fetchRoute();
        }
    }, []);

    const fetchRoute = async () => {
        setLoading(true);
        setError(null);

        try {
            // Create a new tour and get the route
            const response = await fetch('http://localhost:8000/api/tour/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tour_length: preferences.tourLength,
                    theme: preferences.theme,
                    sound_effects: preferences.soundEffects,
                    guide_personality: preferences.guidePersonality,
                    interactive: preferences.interactive,
                }),
            });

            if (!response.ok) throw new Error('Failed to create tour');

            const data = await response.json();

            // Transform backend response to frontend format
            const stops = data.tour.route.stops.map((stop: any) => ({
                id: stop.id,
                name: stop.name,
                coordinates: stop.coordinates as [number, number],
                address: stop.address,
                poiType: stop.poi_type,
                estimatedTime: stop.estimated_time,
                themes: stop.themes,
            }));

            setRoute(stops);
            useTourStore.getState().setTourId(data.tour_id);
        } catch (err: any) {
            console.error('Error fetching route:', err);
            setError(err.message || 'Failed to generate tour route');

            // Fallback: load sample stops for demo
            loadDemoRoute();
        } finally {
            setLoading(false);
        }
    };

    const loadDemoRoute = async () => {
        try {
            const response = await fetch(`http://localhost:8000/api/pois?theme=${preferences.theme}`);
            const data = await response.json();

            const stops = data.pois.slice(0, 5).map((poi: any) => ({
                id: poi.id,
                name: poi.name,
                coordinates: poi.coordinates as [number, number],
                address: poi.address,
                poiType: poi.poi_type,
                estimatedTime: poi.estimated_duration || 8,
                themes: poi.themes,
            }));

            setRoute(stops);
        } catch {
            // Use hardcoded fallback if API is down
            setRoute([
                {
                    id: 'fallback_1',
                    name: 'Rhode Island State House',
                    coordinates: [41.8305, -71.4148],
                    address: '82 Smith St, Providence, RI',
                    poiType: 'government_building',
                    estimatedTime: 10,
                    themes: ['historical'],
                },
                {
                    id: 'fallback_2',
                    name: 'Providence Athenaeum',
                    coordinates: [41.8255, -71.4065],
                    address: '251 Benefit St, Providence, RI',
                    poiType: 'library',
                    estimatedTime: 10,
                    themes: ['historical', 'ghost'],
                },
            ]);
        }
    };

    const handleBackToHome = () => {
        router.push('/');
    };

    // Theme-specific styling
    const themeClass = `theme-${preferences.theme}`;

    return (
        <div className={`${styles.container} ${themeClass}`}>
            {/* Header */}
            <header className={styles.header}>
                <button className={styles.backBtn} onClick={handleBackToHome}>
                    ← Back
                </button>
                <div className={styles.tourInfo}>
                    <span className={styles.themeBadge}>
                        {preferences.theme === 'historical' && '🏛️'}
                        {preferences.theme === 'art' && '🎨'}
                        {preferences.theme === 'ghost' && '👻'}
                        {preferences.theme.charAt(0).toUpperCase() + preferences.theme.slice(1)} Tour
                    </span>
                </div>
            </header>

            {/* Main content */}
            <main className={styles.main}>
                {/* Map container */}
                <div className={styles.mapContainer}>
                    <Map />

                    {/* Current stop card overlay */}
                    {currentStop && status !== 'initial' && (
                        <div className={styles.currentStopCard}>
                            <div className={styles.stopNumber}>
                                {progressCurrent}/{progressTotal}
                            </div>
                            <div className={styles.stopDetails}>
                                <h3>{currentStop.name}</h3>
                                <p>{currentStop.address}</p>
                            </div>
                        </div>
                    )}
                </div>

                <aside className={styles.sidebar}>
                    <TourStatus />
                    <NarrationCard />
                    <ChatInterface />

                    {/* Location simulator for testing */}
                    <LocationSimulator />

                    {/* Error display */}
                    {error && (
                        <div className={styles.error}>
                            <span>⚠️ {error}</span>
                            <button onClick={() => setError(null)}>Dismiss</button>
                        </div>
                    )}

                    {/* Loading state */}
                    {isLoading && (
                        <div className={styles.loadingOverlay}>
                            <div className={styles.spinner} />
                            <span>Generating your personalized tour...</span>
                        </div>
                    )}
                </aside>
            </main>
        </div>
    );
}
