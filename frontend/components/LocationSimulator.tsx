'use client';

import { useTourStore, selectCurrentStop } from '@/store/tour';
import styles from './LocationSimulator.module.css';

// Movement step in degrees (roughly 20-30 meters per step)
const STEP_SIZE = 0.0003;

interface LocationSimulatorProps {
    className?: string;
}

export default function LocationSimulator({ className }: LocationSimulatorProps) {
    const { currentLocation, updateLocation, status } = useTourStore();
    const currentStop = useTourStore(selectCurrentStop);

    // Default to Providence center if no location set
    const [lat, lng] = currentLocation || [41.8240, -71.4128];

    const move = (direction: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw') => {
        let newLat = lat;
        let newLng = lng;

        switch (direction) {
            case 'n':
                newLat += STEP_SIZE;
                break;
            case 's':
                newLat -= STEP_SIZE;
                break;
            case 'e':
                newLng += STEP_SIZE;
                break;
            case 'w':
                newLng -= STEP_SIZE;
                break;
            case 'ne':
                newLat += STEP_SIZE;
                newLng += STEP_SIZE;
                break;
            case 'nw':
                newLat += STEP_SIZE;
                newLng -= STEP_SIZE;
                break;
            case 'se':
                newLat -= STEP_SIZE;
                newLng += STEP_SIZE;
                break;
            case 'sw':
                newLat -= STEP_SIZE;
                newLng -= STEP_SIZE;
                break;
        }

        updateLocation(newLat, newLng);
    };

    const teleportToStop = () => {
        if (currentStop) {
            updateLocation(currentStop.coordinates[0], currentStop.coordinates[1]);
        }
    };

    const resetToCenter = () => {
        updateLocation(41.8240, -71.4128);
    };

    return (
        <div className={`${styles.container} ${className || ''}`}>
            <div className={styles.header}>
                <span className={styles.title}>📍 Location Simulator</span>
                <span className={styles.coords}>
                    {lat.toFixed(5)}, {lng.toFixed(5)}
                </span>
            </div>

            {/* D-Pad style controls */}
            <div className={styles.dpad}>
                <button
                    className={`${styles.btn} ${styles.btnNW}`}
                    onClick={() => move('nw')}
                    title="Northwest"
                >
                    ↖
                </button>
                <button
                    className={`${styles.btn} ${styles.btnN}`}
                    onClick={() => move('n')}
                    title="North"
                >
                    ↑
                </button>
                <button
                    className={`${styles.btn} ${styles.btnNE}`}
                    onClick={() => move('ne')}
                    title="Northeast"
                >
                    ↗
                </button>

                <button
                    className={`${styles.btn} ${styles.btnW}`}
                    onClick={() => move('w')}
                    title="West"
                >
                    ←
                </button>
                <div className={styles.center}>
                    <span>🚶</span>
                </div>
                <button
                    className={`${styles.btn} ${styles.btnE}`}
                    onClick={() => move('e')}
                    title="East"
                >
                    →
                </button>

                <button
                    className={`${styles.btn} ${styles.btnSW}`}
                    onClick={() => move('sw')}
                    title="Southwest"
                >
                    ↙
                </button>
                <button
                    className={`${styles.btn} ${styles.btnS}`}
                    onClick={() => move('s')}
                    title="South"
                >
                    ↓
                </button>
                <button
                    className={`${styles.btn} ${styles.btnSE}`}
                    onClick={() => move('se')}
                    title="Southeast"
                >
                    ↘
                </button>
            </div>

            {/* Quick actions */}
            <div className={styles.actions}>
                {currentStop && status === 'traveling' && (
                    <button
                        className={styles.teleportBtn}
                        onClick={teleportToStop}
                    >
                        ⚡ Teleport to {currentStop.name.split(' ')[0]}...
                    </button>
                )}
                <button
                    className={styles.resetBtn}
                    onClick={resetToCenter}
                >
                    🔄 Reset
                </button>
            </div>
        </div>
    );
}
