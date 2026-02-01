'use client';

import { useState, useEffect, useRef } from 'react';
import { useTourStore } from '@/store/tour';
import { Mic, MicOff, WifiOff } from 'lucide-react';
import styles from './ContinuousVoiceListener.module.css';

export default function ContinuousVoiceListener() {
    const { stopAudio, preferences, setPendingVoiceMessage } = useTourStore();
    const [isListening, setIsListening] = useState(false);
    const [isSupported, setIsSupported] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);

    // UI state for errors
    const [error, setError] = useState<string | null>(null);
    const [networkErrorCount, setNetworkErrorCount] = useState(0);

    // Logic state (Refs to avoid stale closures in callbacks)
    const networkErrorCountRef = useRef(0);
    const recognitionRef = useRef<any>(null);
    const hasPausedRef = useRef(false);
    const restartTimeoutRef = useRef<any>(null);

    // Keep external handlers up to date in refs
    const stopAudioRef = useRef(stopAudio);
    const setPendingRef = useRef(setPendingVoiceMessage);

    useEffect(() => {
        stopAudioRef.current = stopAudio;
        setPendingRef.current = setPendingVoiceMessage;
    }, [stopAudio, setPendingVoiceMessage]);

    // Max network errors before giving up (prevents infinite error loops)
    const MAX_NETWORK_ERRORS = 3;

    // Initialize speech recognition
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const SpeechRecognitionAPI = (window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition;

        if (!SpeechRecognitionAPI) {
            console.log('Speech Recognition not supported in this browser');
            return;
        }

        setIsSupported(true);

        // Cleanup function for the effect
        return () => {
            if (restartTimeoutRef.current) {
                clearTimeout(restartTimeoutRef.current);
            }
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }
        };
    }, []);

    // Manage Recognition Lifecycle
    useEffect(() => {
        if (!isSupported) return;

        // Reset legacy instance if exists
        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch (e) { }
        }

        const SpeechRecognitionAPI = (window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognitionAPI();

        // Configure for robust listening (continuous=false + auto-restart)
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            console.log('🎤 Continuous listening started (Session)');
            setIsListening(true);
            setError(null);
            // Reset error count on successful start
            networkErrorCountRef.current = 0;
            setNetworkErrorCount(0);
        };

        recognition.onend = () => {
            // Check current global preference state directly
            const { continuousListening } = useTourStore.getState().preferences;

            // Auto-restart if enabled and within error limits
            if (continuousListening && networkErrorCountRef.current < MAX_NETWORK_ERRORS) {
                // Immediate restart for continuous effect
                try {
                    recognition.start();
                } catch (e) {
                    // Ignore "already started" errors
                }
            } else {
                setIsListening(false);
                setIsSpeaking(false);
                hasPausedRef.current = false;
            }
        };

        recognition.onresult = (event: any) => {
            const lastResultIndex = event.results.length - 1;
            const result = event.results[lastResultIndex];
            const transcript = result[0].transcript.trim();

            if (!transcript) return;

            // Pause narrator immediately
            if (!hasPausedRef.current) {
                console.log('🔇 Speech detected');
                stopAudioRef.current();
                hasPausedRef.current = true;
                setIsSpeaking(true);
            }

            // Capture final result
            if (result.isFinal) {
                console.log('💬 Final transcript:', transcript);
                setIsSpeaking(false);
                hasPausedRef.current = false;

                if (transcript.length > 0) {
                    setPendingRef.current(transcript);
                }
            }
        };

        recognition.onerror = (event: any) => {
            // Use warn instead of error for network issues to avoid big red overlay in dev
            if (event.error === 'network') {
                networkErrorCountRef.current += 1;
                setNetworkErrorCount(prev => prev + 1);
                console.warn(`Speech API Network error (${networkErrorCountRef.current}/${MAX_NETWORK_ERRORS})`);

                if (networkErrorCountRef.current >= MAX_NETWORK_ERRORS) {
                    console.error('Max network retries reached. Stopping listener.');
                    setError('Network Limit Reached');
                }
            } else if (event.error === 'not-allowed') {
                console.error('Microphone blocked');
                setError('Mic Blocked');
                networkErrorCountRef.current = MAX_NETWORK_ERRORS; // Stop retrying
            } else if (event.error === 'no-speech') {
                // Ignore, onend will restart
            } else if (event.error === 'aborted') {
                // Ignore
            } else {
                console.warn('Speech error:', event.error);
                setError(event.error);
            }
        };

        recognitionRef.current = recognition;

        // Start with small delay to handle Strict Mode double-mount safety
        const startTimer = setTimeout(() => {
            if (useTourStore.getState().preferences.continuousListening) {
                try {
                    recognition.start();
                } catch (e) {
                    console.warn('Start failed:', e);
                }
            }
        }, 100);

        return () => {
            clearTimeout(startTimer);
            recognition.abort();
        };
    }, [isSupported]); // Only re-run if support status changes (initially)

    // Handle Toggle/Preference Changes Separately
    const { continuousListening } = preferences;
    useEffect(() => {
        if (!recognitionRef.current || !isSupported) return;

        if (continuousListening && networkErrorCount < MAX_NETWORK_ERRORS) {
            try {
                recognitionRef.current.start();
            } catch (e) {
                // Already started
            }
        } else {
            try {
                recognitionRef.current.abort();
            } catch (e) {
                // Ignore
            }
        }
    }, [continuousListening, isSupported, networkErrorCount]);

    // Manual Retry
    const handleRetry = () => {
        networkErrorCountRef.current = 0;
        setNetworkErrorCount(0);
        setError(null);
        if (recognitionRef.current) {
            try {
                recognitionRef.current.start();
            } catch (e) {
                console.warn('Retry failed:', e);
            }
        }
    };

    if (!isSupported || !preferences.continuousListening) {
        return null;
    }

    const isNetworkError = networkErrorCount >= MAX_NETWORK_ERRORS;

    return (
        <div className={styles.container}>
            <div
                className={`${styles.indicator} ${isListening ? styles.listening : ''} ${isSpeaking ? styles.speaking : ''} ${isNetworkError ? styles.error : ''}`}
                onClick={isNetworkError ? handleRetry : undefined}
                title={isNetworkError ? 'Click to retry' : isListening ? 'Listening...' : 'Microphone off'}
                style={{ cursor: isNetworkError ? 'pointer' : 'default' }}
            >
                {isNetworkError ? (
                    <WifiOff size={16} className={styles.icon} />
                ) : isListening ? (
                    <Mic size={16} className={styles.icon} />
                ) : (
                    <MicOff size={16} className={styles.icon} />
                )}
            </div>
            {error && <span className={styles.errorText}>{error}</span>}
        </div>
    );
}
