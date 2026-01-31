'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTourStore, TourTheme, GuidePersonality } from '@/store/tour';
import styles from './page.module.css';

const THEMES: { id: TourTheme; name: string; icon: string; description: string }[] = [
  { id: 'historical', name: 'Historical', icon: '🏛️', description: 'Colonial heritage & founding stories' },
  { id: 'art', name: 'Art & Culture', icon: '🎨', description: 'Museums, galleries & creative spaces' },
  { id: 'ghost', name: 'Ghost & Mystery', icon: '👻', description: 'Haunted tales & dark legends' },
];

const PERSONALITIES: { id: GuidePersonality; name: string; emoji: string }[] = [
  { id: 'friendly', name: 'Friendly', emoji: '😊' },
  { id: 'funny', name: 'Humorous', emoji: '😄' },
  { id: 'serious', name: 'Scholarly', emoji: '🎓' },
  { id: 'dramatic', name: 'Dramatic', emoji: '🎭' },
];

export default function Home() {
  const router = useRouter();
  const { preferences, setPreferences } = useTourStore();
  const [isLoading, setIsLoading] = useState(false);

  const handleStartTour = async () => {
    setIsLoading(true);
    try {
      // Create tour via API
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
      useTourStore.getState().setTourId(data.tour_id);

      router.push('/tour');
    } catch (error) {
      console.error('Error creating tour:', error);
      // For demo, navigate anyway
      router.push('/tour');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Background effects */}
      <div className={styles.bgGradient} />
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />

      <main className={styles.main}>
        {/* Hero */}
        <header className={styles.hero}>
          <span className={styles.badge}>✨ AI-Powered Experience</span>
          <h1 className={styles.title}>
            Explore <span className={styles.highlight}>Providence</span>
          </h1>
          <p className={styles.subtitle}>
            Your personalized walking tour with an AI guide that knows every story,
            every secret, and every hidden gem.
          </p>
        </header>

        {/* Preferences Form */}
        <section className={styles.preferences}>
          {/* Theme Selection */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Choose Your Tour Theme</h2>
            <div className={styles.themeGrid}>
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  className={`${styles.themeCard} ${preferences.theme === theme.id ? styles.themeCardSelected : ''
                    } theme-card theme-${theme.id} ${preferences.theme === theme.id ? 'selected' : ''
                    }`}
                  onClick={() => setPreferences({ theme: theme.id })}
                >
                  <span className={styles.themeIcon}>{theme.icon}</span>
                  <span className={styles.themeName}>{theme.name}</span>
                  <span className={styles.themeDesc}>{theme.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tour Length */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Tour Duration</h2>
            <div className={styles.sliderContainer}>
              <input
                type="range"
                min="30"
                max="120"
                step="15"
                value={preferences.tourLength}
                onChange={(e) => setPreferences({ tourLength: Number(e.target.value) })}
                className="slider"
              />
              <div className={styles.sliderLabels}>
                <span>30 min</span>
                <span className={styles.sliderValue}>{preferences.tourLength} minutes</span>
                <span>2 hours</span>
              </div>
            </div>
          </div>

          {/* Guide Personality */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Guide Personality</h2>
            <div className={styles.personalityGrid}>
              {PERSONALITIES.map((p) => (
                <button
                  key={p.id}
                  className={`${styles.personalityBtn} ${preferences.guidePersonality === p.id ? styles.personalityBtnSelected : ''
                    }`}
                  onClick={() => setPreferences({ guidePersonality: p.id })}
                >
                  <span>{p.emoji}</span>
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Options</h2>
            <div className={styles.optionsRow}>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={preferences.soundEffects}
                  onChange={(e) => setPreferences({ soundEffects: e.target.checked })}
                />
                <span className={styles.toggleSlider}></span>
                <span>Sound Effects</span>
              </label>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={preferences.interactive}
                  onChange={(e) => setPreferences({ interactive: e.target.checked })}
                />
                <span className={styles.toggleSlider}></span>
                <span>Interactive Questions</span>
              </label>
            </div>
          </div>
        </section>

        {/* Start Button */}
        <button
          className={`btn btn-primary ${styles.startBtn}`}
          onClick={handleStartTour}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <span className={styles.spinner} />
              Creating Your Tour...
            </>
          ) : (
            <>
              🚀 Start Your Adventure
            </>
          )}
        </button>
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <p>Powered by Gemini AI, ElevenLabs & Google Maps</p>
      </footer>
    </div>
  );
}
