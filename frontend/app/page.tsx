'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTourStore, TourTheme, GuidePersonality } from '@/store/tour';
import styles from './page.module.css';
import LandingMap from './components/LandingMap';
import CityNameAnimation from './components/CityNameAnimation';
import {
  Landmark,
  Palette,
  Ghost,
  Building2,
  Coffee,
  MapPin,
  ChevronRight,
  ChevronLeft,
  Martini
} from 'lucide-react';

// Enhanced Themes with Lucide Icons
const THEMES: { id: string; name: string; icon: any; description: string }[] = [
  { id: 'historical', name: 'Historical', icon: Landmark, description: 'Colonial heritage & founding stories' },
  { id: 'art', name: 'Art & Culture', icon: Palette, description: 'Museums, galleries & creative spaces' },
  { id: 'ghost', name: 'Ghost & Mystery', icon: Ghost, description: 'Haunted tales & dark legends' },
  { id: 'architecture', name: 'Architecture', icon: Building2, description: 'Iconic buildings & design' },
  { id: 'food', name: 'Food & Drink', icon: Coffee, description: 'Local culinary hotspots' },
  { id: 'nightlife', name: 'Nightlife', icon: Martini, description: 'Bars, clubs & evening entertainment' },
];

import { CHARACTERS } from '@/constants/characters';


export default function Home() {
  const router = useRouter();
  const { preferences, setPreferences } = useTourStore();

  // Ensure theme is reset to empty if coming fresh, OR rely on store default.
  // Store default might contain something. Let's force reset if viewMode is hero toggle.
  // But safer to just rely on user interaction.

  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'hero' | 'wizard'>('hero');
  const [wizardStep, setWizardStep] = useState(0); // 0: Theme, 1: Duration, 2: Personality
  const [cityName, setCityName] = useState('Providence');

  const nextStep = () => {
    if (wizardStep < 2) setWizardStep(wizardStep + 1);
  };

  const prevStep = () => {
    if (wizardStep > 0) {
      setWizardStep(wizardStep - 1);
    } else {
      setViewMode('hero');
    }
  };

  const handleThemeSelect = (themeId: string) => {
    setPreferences({ theme: themeId as any });
    // No auto-advance - user clicks Next to proceed
  };

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

  // Helper to render current wizard step
  const renderWizardStep = () => {
    switch (wizardStep) {
      case 0:
        return (
          <div className={styles.stepContent}>
            <div className={styles.wizardHeader}>
              <h2 className={styles.wizardTitle}>Choose Your Adventure</h2>
            </div>

            <div className={styles.circleContainer}>
              {THEMES.map((theme, index) => {
                const Icon = theme.icon;
                const totalItems = THEMES.length;
                const angle = (360 / totalItems) * index - 90; // Start from top (-90deg)
                const radius = 180; // Distance from center

                // Calculate position
                const x = radius * Math.cos((angle * Math.PI) / 180);
                const y = radius * Math.sin((angle * Math.PI) / 180);

                return (
                  <button
                    key={theme.id}
                    className={`${styles.themeOrbitItem} ${preferences.theme === theme.id ? styles.themeOrbitItemSelected : ''}`}
                    onClick={() => handleThemeSelect(theme.id)}
                    style={{
                      transform: `translate(${x}px, ${y}px)`
                    }}
                  >
                    <div className={styles.themeIconWrapper}>
                      <Icon size={32} strokeWidth={1.5} />
                    </div>
                    <span className={styles.themeName}>{theme.name}</span>
                  </button>
                );
              })}

              {/* Custom Theme Input (Center) */}
              <div className={styles.centerInputContainer}>
                <input
                  type="text"
                  placeholder="Type your own..."
                  className={styles.centerInput}
                  value={THEMES.some(t => t.id === preferences.theme) ? '' : preferences.theme}
                  onChange={(e) => setPreferences({ theme: e.target.value as any })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      nextStep();
                    }
                  }}
                />
              </div>
            </div>
          </div>
        );

      case 1:
        return (
          <div className={styles.stepContent}>
            <div className={styles.wizardHeader}>
              <h2 className={styles.wizardTitle}>How much time do you have?</h2>
            </div>

            <div className={styles.sliderContainer} style={{ padding: '2rem 0' }}>
              <input
                type="range"
                min="30"
                max="120"
                step="5" /* Smooth adjustment */
                value={preferences.tourLength}
                onChange={(e) => setPreferences({ tourLength: Number(e.target.value) })}
                className={styles.slider}
                style={{ width: '100%', height: '8px', borderRadius: '4px', accentColor: 'var(--primary)' }}
              />
              <div className={styles.sliderLabels} style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--foreground-muted)' }}>30 min</span>
                <span className={styles.sliderValue} style={{ fontSize: '1.5rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                  {preferences.tourLength} minutes
                </span>
                <span style={{ color: 'var(--foreground-muted)' }}>2 hours</span>
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className={styles.stepContent}>
            <div className={styles.wizardHeader}>
              <h2 className={styles.wizardTitle}>Pick Your Guide</h2>
            </div>

            <div className={styles.circleContainer}>
              {CHARACTERS.map((char, index) => {
                const totalItems = CHARACTERS.length;
                const angle = (360 / totalItems) * index - 45; // Start from 45 degrees offset
                const radius = 205;

                const x = radius * Math.cos((angle * Math.PI) / 180);
                const y = radius * Math.sin((angle * Math.PI) / 180);

                return (
                  <button
                    key={char.id}
                    className={`${styles.characterOrbitItem} ${preferences.guidePersonality === char.id ? styles.characterOrbitItemSelected : ''}`}
                    onClick={() => setPreferences({ guidePersonality: char.id })}
                    style={{
                      transform: `translate(${x}px, ${y}px) ${preferences.guidePersonality === char.id ? 'scale(1.1)' : ''}`
                    }}
                  >
                    <div className={styles.characterAvatarContainer}>
                      <img src={char.avatar} alt={char.name} className={styles.characterAvatarImg} />
                    </div>
                    <span className={styles.characterOrbitName}>{char.name}</span>
                    <span className={styles.characterOrbitTagline}>{char.tagline}</span>
                  </button>
                );
              })}

              {/* Start Button in Center */}
              <button
                className={styles.centerStartBtn}
                onClick={handleStartTour}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span className={styles.spinner} />
                    <span>Loading...</span>
                  </>
                ) : (
                  <>Let's Go!</>
                )}
              </button>
            </div>
          </div>
        );


      default:
        return null;
    }
  };

  return (
    <div className={styles.container}>
      {/* Background effects */}
      <LandingMap onCityFound={setCityName} />
      {/* Subtle background overlay */}
      <div className={styles.bgGradient} />

      {/* HERO VIEW - Outside main to cover full screen */}
      {viewMode === 'hero' && (
        <div
          className={styles.heroContainer}
          onClick={() => {
            setViewMode('wizard');
            setWizardStep(0);
            // Reset preferences to avoid pre-selection
            setPreferences({ theme: '' as any });
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setViewMode('wizard');
              setWizardStep(0);
            }
          }}
        >
          <header className={styles.hero}>
            <h1 className={styles.title}>
              Explore <CityNameAnimation key={cityName} targetCity={cityName} className={styles.highlight} />
            </h1>
          </header>

          <span className={styles.clickToStart}>
            Click anywhere to start
          </span>
        </div>
      )}

      <main className={styles.main}>

        {/* WIZARD VIEW */}
        {viewMode === 'wizard' && (
          <div className={styles.wizardOverlay}>
            <div className={styles.wizardContainer}>
              {/* Step Progress Indicator (optional) */}
              <div style={{ display: 'flex', gap: '4px', marginBottom: '1rem' }}>
                {[0, 1, 2].map(step => (
                  <div key={step} style={{
                    flex: 1,
                    height: '4px',
                    borderRadius: '2px',
                    background: step <= wizardStep ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                    transition: 'background 0.3s'
                  }} />
                ))}
              </div>

              {renderWizardStep()}

              {/* Navigation Footer */}
              <div className={styles.wizardNavigation}>
                <button className={styles.backBtn} onClick={prevStep}>
                  <ChevronLeft size={16} />
                  Back
                </button>

                {/* Only show Next button if not on last step */}
                {wizardStep < 2 && (
                  <button className={styles.nextBtn} onClick={nextStep}>
                    Next
                    <ChevronRight size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>


    </div >
  );
}
