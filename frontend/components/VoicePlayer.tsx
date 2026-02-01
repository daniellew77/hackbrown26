'use client';

import { useState, useRef, useEffect } from 'react';
import { useTourStore } from '@/store/tour';
import { Volume2, Pause, AlertCircle } from 'lucide-react';
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

    const isFetchingRef = useRef(false);

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
            // Dedup: Don't fetch if successfully fetched this text already OR if currently loading
            // We use a separate ref for 'attempted' text to catch race conditions and isFetchingRef for sync blocking
            if (lastFetchedText.current === text || isFetchingRef.current) return;

            // Check if TTS is enabled in preferences
            const isTtsEnabled = useTourStore.getState().preferences.ttsEnabled;
            console.log("🎙️ VoicePlayer check - TTS enabled:", isTtsEnabled, "tourId:", tourId, "text length:", text?.length);

            if (!isTtsEnabled) {
                console.log("TTS is disabled, skipping auto-play");
                // Mark as 'handled' so we don't spam logs
                lastFetchedText.current = text;
                return;
            }

            console.log("🎙️ Calling fetchAndPlay...");
            fetchAndPlay();
        }

        return () => {
            console.log("🎙️ VoicePlayer effect cleanup. Aborting...", { textLen: text?.length });
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                isFetchingRef.current = false; // Allow immediate retry (Strict Mode compat)
                if (lastFetchedText.current === text) {
                    lastFetchedText.current = null;
                }
            }
        };
    }, [text, tourId, autoplay]);

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
        isFetchingRef.current = true;
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
            console.log("🎙️ Audio fetched successfully, url created:", url);
            setAudioUrl(url);

            // Play ...
            setTimeout(() => {
                if (audioRef.current && !controller.signal.aborted) {
                    console.log("🎙️ Attempting to auto-play...");
                    audioRef.current.play()
                        .then(() => {
                            console.log("🎙️ Auto-play started!");
                            setIsPlaying(true);
                        })
                        .catch(e => console.error("🎙️ Auto-play failed:", e));
                } else {
                    console.log("🎙️ Auto-play skipped: ref missing or aborted", { ref: !!audioRef.current, aborted: controller.signal.aborted });
                }
            }, 100);

        } catch (err: any) {
            if (err.name === 'AbortError') {
                console.log("🎙️ Fetch aborted (AbortError)");
                return;
            }
            console.error('Audio error:', err);
            setError('Could not load audio');
            lastFetchedText.current = null; // Retry allowed on error
        } finally {
            if (abortControllerRef.current === controller) {
                console.log("🎙️ fetchAndPlay finished (loading=false)");
                setIsLoading(false);
                isFetchingRef.current = false;
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
                    <Pause size={18} />
                ) : (
                    <Volume2 size={18} />
                )}
            </button>

            {error && (
                <span className={styles.error} title={error}>
                    <AlertCircle size={16} />
                </span>
            )}
        </div>
    );
}

