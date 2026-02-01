'use client';

import { useState, useRef, useEffect } from 'react';
import { useTourStore } from '@/store/tour';
import styles from './VoicePlayer.module.css';

interface VoicePlayerProps {
    text: string;
    autoplay?: boolean;
    onEnded?: () => void;
}

export default function VoicePlayer({ text, autoplay = true, onEnded }: VoicePlayerProps) {
    const { tourId, audioStopTrigger } = useTourStore();
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const lastFetchedText = useRef<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Audio Interrupt Handler
    useEffect(() => {
        if (audioStopTrigger > 0) {
            console.log("🛑 Audio Interrupt Triggered");
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            setIsPlaying(false);
            setIsLoading(false);
        }
    }, [audioStopTrigger]);

    // Reset when text changes
    useEffect(() => {
        // Cleanup previous audio
        if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
            setAudioUrl(null);
        }
        setIsPlaying(false);
        setError(null);

        // Reset fetch tracking if text changed
        if (text !== lastFetchedText.current) {
            lastFetchedText.current = null;
        }

        if (text && autoplay && tourId) {
            // Dedup: Don't fetch if successfully fetched this text already
            if (lastFetchedText.current === text) return;

            fetchAndPlay();
        }

        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [text, tourId]);

    // ...

    const fetchAndPlay = async () => {
        if (!text || !tourId) return;

        // Abort previous pending request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;

        setIsLoading(true);
        setError(null);

        try {
            lastFetchedText.current = text; // Mark as attempting

            const response = await fetch(`http://localhost:8000/api/tour/${tourId}/audio`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
                signal: controller.signal
            });

            if (!response.ok) throw new Error('Failed to generate audio');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            setAudioUrl(url);

            // Play ...
            setTimeout(() => {
                if (audioRef.current && !controller.signal.aborted) {
                    audioRef.current.play()
                        .then(() => setIsPlaying(true))
                        .catch(e => console.error("Auto-play failed:", e));
                }
            }, 100);

        } catch (err: any) {
            if (err.name === 'AbortError') return;
            console.error('Audio error:', err);
            setError('Could not load audio');
            lastFetchedText.current = null; // Retry allowed on error
        } finally {
            if (abortControllerRef.current === controller) {
                setIsLoading(false);
            }
        }
    };

    const togglePlay = () => {
        if (!audioRef.current) return;

        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            if (!audioUrl) {
                fetchAndPlay();
            } else {
                audioRef.current.play();
                setIsPlaying(true);
            }
        }
    };

    const handleEnded = () => {
        setIsPlaying(false);
        onEnded?.();
    };

    if (!text) return null;

    return (
        <div className={styles.player}>
            <audio
                ref={audioRef}
                src={audioUrl || undefined}
                onEnded={handleEnded}
            />

            <button
                onClick={togglePlay}
                disabled={isLoading}
                className={styles.playBtn}
                title={isPlaying ? "Pause Narration" : "Play Narration"}
            >
                {isLoading ? (
                    <span className={styles.spinner} />
                ) : isPlaying ? (
                    <span className={styles.icon}>⏸️</span>
                ) : (
                    <span className={styles.icon}>🔊</span>
                )}
            </button>

            {error && (
                <span className={styles.error} title={error}>⚠️</span>
            )}
        </div>
    );
}
