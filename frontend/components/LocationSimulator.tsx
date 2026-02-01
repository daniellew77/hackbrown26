'use client';

import { useTourStore, selectCurrentStop } from '@/store/tour';
import styles from './LocationSimulator.module.css';

// Movement step in degrees (roughly 20-30 meters per step)
const STEP_SIZE = 0.0003;

interface LocationSimulatorProps {
    className?: string;
}

export default function LocationSimulator({ className }: LocationSimulatorProps) {
    const { currentLocation, updateLocation, status, isDemoMode, toggleDemoMode } = useTourStore();
    const currentStop = useTourStore(selectCurrentStop);

    // Default to Providence center if no location set
    const [lat, lng] = currentLocation || [41.8240, -71.4128];

    const move = (direction: 'n' | 's' | 'e' | 'w') => {
        let newLat = lat;
        let newLng = lng;

        switch (direction) {
            case 'n': newLat += STEP_SIZE; break;
            case 's': newLat -= STEP_SIZE; break;
            case 'e': newLng += STEP_SIZE; break;
            case 'w': newLng -= STEP_SIZE; break;
        }

        updateLocation(newLat, newLng);
    };

    const teleportToStop = () => {
        if (currentStop) {
            updateLocation(currentStop.coordinates[0], currentStop.coordinates[1]);
        }
    };

    return (
        <div className={`${styles.container} ${styles.compact} ${className || ''}`}>
            {/* Compact D-Pad */}
            <div className={styles.miniDpad}>
                <button className={styles.miniBtn} onClick={() => move('n')} title="North">↑</button>
                <div className={styles.miniRow}>
                    <button className={styles.miniBtn} onClick={() => move('w')} title="West">←</button>
                    <span className={styles.miniCenter}>🚶</span>
                    <button className={styles.miniBtn} onClick={() => move('e')} title="East">→</button>
                </div>
                <button className={styles.miniBtn} onClick={() => move('s')} title="South">↓</button>
            </div>

            {/* Quick teleport (only when traveling) */}
            {currentStop && status === 'traveling' && (
                <button className={styles.teleportMini} onClick={teleportToStop} title={`Teleport to ${currentStop.name}`}>
                    ⚡
                </button>
            )}

            {/* Demo mode toggle */}
            <label className={styles.demoLabel}>
                <input
                    type="checkbox"
                    checked={isDemoMode}
                    onChange={toggleDemoMode}
                />
                <span>Demo</span>
            </label>
        </div>
    );
}
