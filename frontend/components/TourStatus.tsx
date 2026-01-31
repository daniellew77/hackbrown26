'use client';

import { useTourStore, selectCurrentStop, selectNextStop, selectProgressCurrent, selectProgressTotal, selectProgressPercentage } from '@/store/tour';
import styles from './TourStatus.module.css';

const STATUS_CONFIG = {
    initial: {
        icon: '🎯',
        label: 'Ready to Start',
        color: 'var(--primary)',
    },
    traveling: {
        icon: '🚶',
        label: 'Walking',
        color: 'var(--success)',
    },
    poi: {
        icon: '📍',
        label: 'At Location',
        color: 'var(--theme-historical)',
    },
    complete: {
        icon: '🎉',
        label: 'Tour Complete',
        color: 'var(--primary)',
    },
};

interface TourStatusProps {
    className?: string;
    onStartTour?: () => void;
    onSkipStop?: () => void;
}

export default function TourStatus({ className, onStartTour, onSkipStop }: TourStatusProps) {
    const { status, preferences, setStatus, advanceStop, isDemoMode, toggleDemoMode } = useTourStore();
    const currentStop = useTourStore(selectCurrentStop);
    const nextStop = useTourStore(selectNextStop);
    const progressCurrent = useTourStore(selectProgressCurrent);
    const progressTotal = useTourStore(selectProgressTotal);
    const progressPercentage = useTourStore(selectProgressPercentage);

    const config = STATUS_CONFIG[status];
    const themeColor = `var(--theme-${preferences.theme})`;

    const handleStart = () => {
        setStatus('traveling');
        onStartTour?.();
    };

    const handleSkip = () => {
        advanceStop();
        onSkipStop?.();
    };

    const handleArrive = () => {
        setStatus('poi');
    };

    const handleContinue = () => {
        advanceStop();
        setStatus('traveling');
    };

    return (
        <div className={`${styles.container} ${className || ''}`}>
            {/* Progress bar */}
            <div className={styles.progressBar}>
                <div
                    className={styles.progressFill}
                    style={{
                        width: `${progressPercentage}%`,
                        background: themeColor
                    }}
                />
            </div>

            {/* Status header */}
            <div className={styles.header}>
                <div className={styles.status}>
                    <span className={styles.statusIcon}>{config.icon}</span>
                    <span className={styles.statusLabel}>{config.label}</span>
                </div>
                <div className={styles.progressText}>
                    Stop {progressCurrent} of {progressTotal}
                </div>
            </div>

            {/* Current/Next stop info */}
            <div className={styles.stopInfo}>
                {status === 'initial' && currentStop && (
                    <>
                        <h3 className={styles.stopTitle}>First Stop</h3>
                        <p className={styles.stopName}>{currentStop.name}</p>
                        <p className={styles.stopAddress}>{currentStop.address}</p>
                    </>
                )}

                {status === 'traveling' && currentStop && (
                    <>
                        <h3 className={styles.stopTitle}>Walking to</h3>
                        <p className={styles.stopName}>{currentStop.name}</p>
                        <p className={styles.stopAddress}>{currentStop.address}</p>
                    </>
                )}

                {status === 'poi' && currentStop && (
                    <>
                        <h3 className={styles.stopTitle}>Now Exploring</h3>
                        <p className={styles.stopName}>{currentStop.name}</p>
                        {nextStop && (
                            <p className={styles.nextStop}>
                                Next: {nextStop.name}
                            </p>
                        )}
                    </>
                )}

                {status === 'complete' && (
                    <>
                        <h3 className={styles.stopTitle}>🎊 Congratulations!</h3>
                        <p className={styles.stopName}>You've completed your tour</p>
                    </>
                )}
            </div>

            {/* Action buttons */}
            <div className={styles.actions}>
                {status === 'initial' && (
                    <button className={`btn btn-primary ${styles.primaryBtn}`} onClick={handleStart}>
                        🚀 Start Tour
                    </button>
                )}

                {status === 'traveling' && (
                    <>
                        <button className={`btn btn-primary ${styles.primaryBtn}`} onClick={handleArrive}>
                            📍 I've Arrived
                        </button>
                        <button className={`btn btn-secondary ${styles.secondaryBtn}`} onClick={handleSkip}>
                            ⏭️ Skip
                        </button>
                    </>
                )}

                {status === 'poi' && nextStop && (
                    <button className={`btn btn-primary ${styles.primaryBtn}`} onClick={handleContinue}>
                        ➡️ Continue to Next Stop
                    </button>
                )}

                {status === 'poi' && !nextStop && (
                    <button
                        className={`btn btn-primary ${styles.primaryBtn}`}
                        onClick={() => setStatus('complete')}
                    >
                        ✅ Finish Tour
                    </button>
                )}
            </div>

            {/* Demo mode toggle */}
            <div className={styles.demoToggle}>
                <label className={styles.toggle}>
                    <input
                        type="checkbox"
                        checked={isDemoMode}
                        onChange={toggleDemoMode}
                    />
                    <span className={styles.toggleSlider}></span>
                    <span>Demo Mode</span>
                </label>
            </div>
        </div>
    );
}
