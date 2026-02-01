
'use client';

import { useState, useRef, useEffect } from 'react';
import { useTourStore } from '@/store/tour';
import styles from './ChatInterface.module.css';
import VoiceInput from './VoiceInput';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export default function ChatInterface() {
    const { tourId, status, stopAudio } = useTourStore();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleVoiceStart = () => {
        stopAudio();
    };

    const sendMessage = async (e?: React.FormEvent, overrideText?: string) => {
        if (e) e.preventDefault();

        const textToSend = overrideText || input;
        if (!textToSend.trim() || !tourId || isLoading) return;

        // 🛑 Stop any playing audio when user sends a message
        stopAudio();

        const userMsg = textToSend.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setIsLoading(true);

        try {
            const response = await fetch(`http://localhost:8000/api/tour/${tourId}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userMsg }),
            });

            if (!response.ok) throw new Error('Failed to send message');

            const data = await response.json();
            setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
        } catch (err) {
            console.error('Chat error:', err);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "I'm having trouble connecting right now. Please try again."
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={styles.chatContainer}>
            <div className={styles.messages}>
                {messages.length === 0 && (
                    <div className={styles.placeholder}>
                        <p>👋 Ask me anything about the tour or this location!</p>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        className={`${styles.message} ${msg.role === 'user' ? styles.user : styles.assistant}`}
                    >
                        <div className={styles.bubble}>
                            {msg.content}
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className={`${styles.message} ${styles.assistant}`}>
                        <div className={styles.bubble}>
                            <span className={styles.typing}>...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className={styles.inputArea}>
                <VoiceInput
                    onInput={(text) => sendMessage(undefined, text)}
                    onStart={handleVoiceStart}
                    disabled={isLoading}
                />

                <form onSubmit={(e) => sendMessage(e)} className={styles.inputForm}>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask a question..."
                        disabled={isLoading}
                        className={styles.input}
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className={styles.sendBtn}
                    >
                        Send
                    </button>
                </form>
            </div>
        </div>
    );
}
