'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useTourStore, selectCurrentStop, selectNextStop, selectProgressCurrent, selectProgressTotal } from '@/store/tour';
import { useGeolocation } from '@/hooks/useGeolocation';
import LocationSimulator from '@/components/LocationSimulator';
import NarrationCard from '@/components/NarrationCard';
import ChatInterface from '@/components/ChatInterface';
import { decodePolyline } from '@/utils/polyline';
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
    const { tourId, status, preferences, route, setRoute, setStatus, advanceStop, isLoading, error, setLoading, setError } = useTourStore();
    const currentStop = useTourStore(selectCurrentStop);
    const nextStop = useTourStore(selectNextStop);
    const progressCurrent = useTourStore(selectProgressCurrent);
    const progressTotal = useTourStore(selectProgressTotal);

    const [chatExpanded, setChatExpanded] = useState(false);
    const [showIntro, setShowIntro] = useState(true);  // Show intro overlay initially

    // Enable geolocation tracking
    useGeolocation();

    // Fetch directions when target stop changes
    useEffect(() => {
        if (!tourId || !currentStop) return;

        const fetchWalkingDirections = async () => {
            const startLoc = useTourStore.getState().currentLocation || [41.8240, -71.4128];

            try {
                const response = await fetch(`http://localhost:8000/api/tour/${tourId}/location`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        lat: startLoc[0],
                        lng: startLoc[1]
                    }),
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.directions?.overview_polyline) {
                        const path = decodePolyline(data.directions.overview_polyline);
                        useTourStore.getState().setCurrentPath(path);
                    } else {
                        useTourStore.getState().setCurrentPath([]);
                    }
                }
            } catch (e) {
                console.error("Failed to update directions:", e);
            }
        };

        fetchWalkingDirections();
    }, [tourId, currentStop?.id]);

    // Fetch route on mount if not already loaded
    useEffect(() => {
        if (!useTourStore.getState().currentLocation) {
            useTourStore.getState().updateLocation(41.8240, -71.4128);
        }

        if (route.stops.length === 0 && !isLoading) {
            fetchRoute();
        }
    }, []);

    // ESC key to go back home
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                router.push('/');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [router]);

    const fetchRoute = async () => {
        setLoading(true);
        setError(null);

        try {
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

    // Tour action handlers
    const syncAdvance = async () => {
        if (!tourId) return;
        try {
            await fetch(`http://localhost:8000/api/tour/${tourId}/advance`, { method: 'POST' });
        } catch (e) {
            console.error('Failed to sync tour progress:', e);
        }
    };

    const syncTransition = async (newStatus: string) => {
        if (!tourId) return;
        try {
            await fetch(`http://localhost:8000/api/tour/${tourId}/transition`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_status: newStatus }),
            });
        } catch (e) {
            console.error('Failed to sync tour status:', e);
        }
    };

    const handleStart = () => {
        setStatus('traveling');
        syncTransition('traveling');
    };

    const handleSkip = () => {
        advanceStop();
        syncAdvance();
    };

    const handleArrive = () => {
        setStatus('poi');
        syncTransition('poi');
    };

    const handleContinue = () => {
        advanceStop();
        syncAdvance();
        setStatus('traveling');
        syncTransition('traveling');
    };

    const handleFinish = () => {
        setStatus('complete');
    };

    const handleBackToHome = () => {
        router.push('/');
    };

    return (
        <div className={styles.container}>
            {/* Fullscreen Map */}
            <div className={styles.mapFullscreen}>
                <Map />
            </div>



            {/* Top Left Panel - Stop Info & Actions (hidden during intro) */}
            {!showIntro && (
                <div className={styles.topLeftPanel}>
                    {/* Current Stop Card */}
                    {currentStop && (
                        <div className={styles.stopCard}>
                            <div className={styles.stopNumber}>
                                {progressCurrent}/{progressTotal}
                            </div>
                            <div className={styles.stopDetails}>
                                <h3>{currentStop.name}</h3>
                                <p>{currentStop.address}</p>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className={styles.actionButtons}>
                        {status === 'initial' && (
                            <button className={styles.primaryBtn} onClick={handleStart}>
                                Start Tour
                            </button>
                        )}

                        {status === 'traveling' && (
                            <>
                                <button className={styles.primaryBtn} onClick={handleArrive}>
                                    I've Arrived
                                </button>
                                <button className={styles.secondaryBtn} onClick={handleSkip}>
                                    Skip
                                </button>
                            </>
                        )}

                        {status === 'poi' && nextStop && (
                            <button className={styles.primaryBtn} onClick={handleContinue}>
                                Continue to Next Stop
                            </button>
                        )}

                        {status === 'poi' && !nextStop && (
                            <button className={styles.primaryBtn} onClick={handleFinish}>
                                Finish Tour
                            </button>
                        )}

                        {status === 'complete' && (
                            <div className={styles.completeMessage}>
                                Tour Complete!
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Bottom Left - Location Simulator */}
            {!showIntro && <LocationSimulator className={styles.bottomLeftSimulator} />}

            {/* Intro Overlay backdrop - only the dimmed background */}
            {showIntro && status === 'initial' && (
                <div className={styles.introOverlay} onClick={() => setShowIntro(false)} />
            )}

            {/* Single NarrationCard - position changes based on showIntro */}
            <div className={showIntro && status === 'initial' ? styles.introPanelCentered : styles.topRightPanel}>
                <NarrationCard />
                {showIntro && status === 'initial' && (
                    <button
                        className={styles.showRouteBtn}
                        onClick={() => setShowIntro(false)}
                    >
                        Show me the route!
                    </button>
                )}
            </div>

            {/* Bottom Right - Chat (Expandable) */}
            <div className={`${styles.chatPanel} ${chatExpanded ? styles.chatExpanded : ''}`}>
                <button
                    className={styles.chatToggle}
                    onClick={() => setChatExpanded(!chatExpanded)}
                >
                    {chatExpanded ? '▼ Close Chat' : '▲ Open Chat'}
                </button>
                {chatExpanded && <ChatInterface />}
            </div>

            {/* Error display */}
            {error && (
                <div className={styles.errorOverlay}>
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
        </div>
    );
}

