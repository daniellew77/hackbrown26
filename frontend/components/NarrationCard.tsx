'use client';

import { useEffect, useState } from 'react';
import { useTourStore, selectCurrentStop } from '@/store/tour';
import styles from './NarrationCard.module.css';
import VoicePlayer from './VoicePlayer';

import { CHARACTERS } from '@/constants/characters';

export default function NarrationCard() {
    const { tourId, status, setNarrating, preferences } = useTourStore();
    const currentStop = useTourStore(selectCurrentStop);
    const [narration, setNarration] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        console.log("📘 NarrationCard MOUNTED/UPDATED. Status:", status, "Stop:", currentStop?.id);
        return () => console.log("📘 NarrationCard UNMOUNTING");
    }, []);

    const character = CHARACTERS.find(c => c.id === preferences.guidePersonality) || CHARACTERS[0];
    const guideName = character.name;
    const guideAvatar = character.avatar;

    useEffect(() => {
        // Fetch narration if at a POI, initial, or complete
        const shouldFetch = (status === 'poi' && currentStop) || status === 'initial' || status === 'complete';

        if (shouldFetch && tourId) {
            fetchNarration();
        } else {
            setNarration('');
        }
    }, [status, tourId, currentStop?.id]);

    const fetchNarration = async () => {
        if (!tourId) return;

        setIsLoading(true);
        setError(null);
        setNarrating(true);

        try {
            const response = await fetch(`http://localhost:8000/api/tour/${tourId}/narrate`, {
                method: 'POST',
            });

            if (!response.ok) throw new Error('Failed to generate narration');

            const data = await response.json();
            // Don't show empty narration (e.g. if cached intro is returned but we are at POI)
            if (data.narration) {
                setNarration(data.narration);
            }
        } catch (err) {
            setError('Could not connect to AI Narrator. Please try again.');
            console.error(err);
        } finally {
            setIsLoading(false);
            setNarrating(false);
        }
    };

    // Show card during INITIAL, POI, and COMPLETE states
    if (status !== 'poi' && status !== 'initial' && status !== 'complete') return null;

    return (
        <div className={styles.card}>
            <div className={styles.header} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div className={styles.avatarContainer}>
                        <img src={guideAvatar} alt={guideName} className={styles.avatarImg} />
                    </div>
                    <h3>{guideName}</h3>
                </div>
                {narration && <VoicePlayer text={narration} />}
            </div>

            <div className={styles.content}>
                {isLoading ? (
                    <div className={styles.loading}>
                        <div className={styles.spinner}></div>
                        <p>Bringing you info...</p>
                    </div>
                ) : error ? (
                    <div className={styles.error}>
                        <p>{error}</p>
                        <button onClick={fetchNarration} className={styles.retryBtn}>Retry</button>
                    </div>
                ) : (
                    <div className={styles.text}>
                        {narration.split('\n').map((paragraph, i) => {
                            // Hide bracketed tags from display (SFX, emotions, etc.)
                            const cleanText = paragraph.replace(/\[.*?\]/g, '').trim();
                            return cleanText && <p key={i}>{cleanText}</p>
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
