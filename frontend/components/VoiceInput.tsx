
'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './VoiceInput.module.css';

interface VoiceInputProps {
    onInput: (text: string) => void;
    onStart?: () => void;
    onEnd?: () => void;
    disabled?: boolean;
}

export default function VoiceInput({ onInput, onStart, onEnd, disabled }: VoiceInputProps) {
    const [isListening, setIsListening] = useState(false);
    const [isSupported, setIsSupported] = useState(false);
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            // Check for browser support
            const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

            if (SpeechRecognitionAPI) {
                setIsSupported(true);
                const recognition = new SpeechRecognitionAPI();
                recognition.continuous = false;
                recognition.interimResults = false;
                recognition.lang = 'en-US';

                recognition.onstart = () => {
                    setIsListening(true);
                    onStart?.();
                };

                recognition.onend = () => {
                    setIsListening(false);
                    onEnd?.();
                };

                recognition.onresult = (event: any) => {
                    const transcript = event.results[0][0].transcript;
                    if (transcript) {
                        onInput(transcript);
                    }
                };

                recognition.onerror = (event: any) => {
                    console.error("Speech recognition error", event.error);
                    setIsListening(false);

                    // Provide helpful error messages
                    if (event.error === 'not-allowed') {
                        alert("🎤 Microphone access denied. Please allow microphone access in your browser settings.");
                    } else if (event.error === 'network') {
                        alert("🌐 Network error. Speech recognition requires an internet connection. Try typing instead!");
                    } else if (event.error === 'no-speech') {
                        // User didn't say anything - not an error
                    } else {
                        console.log("Speech error:", event.error);
                    }
                };

                recognitionRef.current = recognition;
            }
        }
    }, [onInput, onStart, onEnd]);

    const toggleListening = () => {
        if (!recognitionRef.current) {
            alert("Voice input is not supported in this browser.");
            return;
        }

        if (isListening) {
            recognitionRef.current.stop();
        } else {
            recognitionRef.current.start();
        }
    };

    if (!isSupported) return null;

    return (
        <button
            className={`${styles.micButton} ${isListening ? styles.listening : ''}`}
            onClick={toggleListening}
            disabled={disabled}
            title="Speak to Guide"
        >
            {isListening ? '🛑' : '🎤'}
        </button>
    );
}
