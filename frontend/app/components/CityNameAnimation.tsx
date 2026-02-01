'use client';

import { useEffect, useState, useRef } from 'react';
import styles from '../page.module.css';

const DUMMY_CITIES = [
    'Paris', 'Tokyo', 'New York', 'London', 'Rome',
    'Berlin', 'Sydney', 'Barcelona', 'Dubai', 'Amsterdam', 'Boston', 'Chicago', 'Los Angeles', 'San Francisco', 'Seattle', 'Miami', 'Denver', 'Houston', 'Philadelphia', 'Phoenix', 'San Antonio', 'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville', 'Fort Worth', 'Columbus', 'Charlotte', 'Indianapolis', 'San Francisco', 'Seattle', 'Miami', 'Denver', 'Houston', 'Philadelphia', 'Phoenix', 'San Antonio', 'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville', 'Fort Worth', 'Columbus', 'Charlotte', 'Indianapolis'
];

interface CityNameAnimationProps {
    targetCity: string;
    className?: string;
}

export default function CityNameAnimation({ targetCity, className }: CityNameAnimationProps) {
    const [displayedCity, setDisplayedCity] = useState(targetCity);
    const [isAnimating, setIsAnimating] = useState(true);

    // Ref to track if we've received a non-default update or if enough time has passed
    const startTimeRef = useRef<number>(Date.now());
    const MIN_ANIMATION_DURATION = 3500; // Run for at least 2 seconds

    useEffect(() => {
        // If we shouldn't animate or animation is done, just set the target
        if (!isAnimating) {
            setDisplayedCity(targetCity);
            return;
        }

        let timeoutId: NodeJS.Timeout;
        let currentDelay = 50; // Start fast
        const MAX_DELAY = 400; // Slow down to this
        const DELAY_INCREMENT = 1.1; // Increase delay by 10% each step

        const animate = () => {
            const now = Date.now();
            const elapsed = now - startTimeRef.current;

            // Logic to stop animation:
            // 1. Min duration has passed AND we are slowing down enough (optional check)
            // 2. OR just strictly time based, but let's make it feel mechanical
            // If elapsed > MIN and we've reached a slow enough speed, stop.

            if (elapsed > MIN_ANIMATION_DURATION && currentDelay >= 200) {
                setDisplayedCity(targetCity);
                setIsAnimating(false);
            } else {
                // Pick a random city that isn't the previous one
                const randomIndex = Math.floor(Math.random() * DUMMY_CITIES.length);
                setDisplayedCity(DUMMY_CITIES[randomIndex]);

                // Decelerate
                currentDelay = Math.min(currentDelay * DELAY_INCREMENT, MAX_DELAY);

                // Schedule next frame
                timeoutId = setTimeout(animate, currentDelay);
            }
        };

        // Start animation loop
        timeoutId = setTimeout(animate, currentDelay);

        return () => clearTimeout(timeoutId);
    }, [targetCity, isAnimating]);

    return (
        <span className={styles.cityNameWrapper}>
            {/* Ghost element determines the width based on TARGET city */}
            <span className={`${className} ${styles.cityGhost}`} aria-hidden="true">
                {targetCity}
            </span>
            {/* Visible element cycles through cities */}
            <span className={`${className} ${styles.cityVisible}`}>
                {displayedCity}
            </span>
        </span>
    );
}
