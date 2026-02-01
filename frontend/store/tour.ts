/**
 * Tour State Store
 * Zustand store for managing client-side tour state
 */

import { create } from 'zustand';

// Types
export type TourTheme = string;
export type GuidePersonality = 'henry' | 'quentin' | 'drew' | 'autumn' | 'funny' | 'serious' | 'dramatic' | 'friendly';
export type TourStatus = 'initial' | 'traveling' | 'poi' | 'complete';

export interface UserPreferences {
    tourLength: number;
    theme: TourTheme;
    soundEffects: boolean;
    guidePersonality: GuidePersonality;
    interactive: boolean;
    ttsEnabled: boolean;
    continuousListening: boolean;
}

export interface POIStop {
    id: string;
    name: string;
    coordinates: [number, number];
    address: string;
    poiType: string;
    estimatedTime: number;
    themes: string[];
}

export interface TourRoute {
    stops: POIStop[];
    currentStopIndex: number;
    currentPath?: [number, number][]; // Array of [lat, lng] coordinates
}

export interface TourState {
    // Tour identification
    tourId: string | null;

    // User preferences
    preferences: UserPreferences;

    // Route data
    route: TourRoute;

    // Current state
    status: TourStatus;
    currentLocation: [number, number] | null;

    // UI state
    isLoading: boolean;
    error: string | null;

    // Narration state
    isNarrating: boolean;
    currentNarration: string;

    // Demo mode
    isDemoMode: boolean;
    audioStopTrigger: number;

    // Pending voice input (from continuous listener)
    pendingVoiceMessage: string | null;
}

interface TourActions {
    // Preference actions
    setPreferences: (preferences: Partial<UserPreferences>) => void;

    // Tour lifecycle
    setTourId: (id: string) => void;
    setRoute: (stops: POIStop[]) => void;
    updateRoute: (stops: POIStop[], currentIndex?: number) => void;
    setStatus: (status: TourStatus) => void;
    setCurrentPath: (path: [number, number][]) => void;

    // Location
    updateLocation: (lat: number, lng: number) => void;

    // Stop navigation
    advanceStop: () => void;
    goToStop: (index: number) => void;

    // Narration
    setNarrating: (isNarrating: boolean, narration?: string) => void;

    // Audio Control
    stopAudio: () => void;

    // Voice input
    setPendingVoiceMessage: (message: string | null) => void;

    // UI state
    setLoading: (isLoading: boolean) => void;
    setError: (error: string | null) => void;

    // Demo mode
    toggleDemoMode: () => void;

    // Reset
    resetTour: () => void;
}

const initialPreferences: UserPreferences = {
    tourLength: 60,
    theme: 'historical',
    soundEffects: true,
    guidePersonality: 'henry',
    interactive: true,
    ttsEnabled: true,
    continuousListening: false,
};

const initialState: TourState = {
    tourId: null,
    preferences: initialPreferences,
    route: {
        stops: [],
        currentStopIndex: 0,
    },
    status: 'initial',
    currentLocation: null,
    isLoading: false,
    error: null,
    isNarrating: false,
    currentNarration: '',
    isDemoMode: false,
    audioStopTrigger: 0,
    pendingVoiceMessage: null,
};

export const useTourStore = create<TourState & TourActions>((set, get) => ({
    ...initialState,

    // ... existing actions ...

    // Audio Control
    stopAudio: () => set((state) => ({ audioStopTrigger: state.audioStopTrigger + 1 })),

    // Voice Input
    setPendingVoiceMessage: (message) => set({ pendingVoiceMessage: message }),

    // Preference actions
    setPreferences: (newPreferences) => set((state) => ({
        preferences: { ...state.preferences, ...newPreferences },
    })),

    // Tour lifecycle
    setTourId: (id) => set({ tourId: id }),

    setRoute: (stops) => set((state) => ({
        route: { ...state.route, stops, currentStopIndex: 0 },
    })),

    updateRoute: (stops, currentIndex) => set((state) => ({
        route: { ...state.route, stops, currentStopIndex: currentIndex ?? state.route.currentStopIndex },
    })),

    setStatus: (status) => set({ status }),

    // Route Path (Google Maps Polyline)
    setCurrentPath: (path: [number, number][]) => set((state) => ({
        route: { ...state.route, currentPath: path }
    })),

    // Location
    updateLocation: (lat, lng) => set({
        currentLocation: [lat, lng],
    }),

    // Stop navigation
    advanceStop: () => set((state) => {
        const nextIndex = state.route.currentStopIndex + 1;
        if (nextIndex < state.route.stops.length) {
            return {
                route: { ...state.route, currentStopIndex: nextIndex },
            };
        }
        return { status: 'complete' };
    }),

    goToStop: (index) => set((state) => {
        if (index >= 0 && index < state.route.stops.length) {
            return {
                route: { ...state.route, currentStopIndex: index },
            };
        }
        return state;
    }),

    // Narration
    setNarrating: (isNarrating, narration = '') => set({
        isNarrating,
        currentNarration: narration,
    }),

    // UI state
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),

    // Demo mode
    toggleDemoMode: () => set((state) => ({
        isDemoMode: !state.isDemoMode,
    })),

    // Reset
    resetTour: () => set({
        ...initialState,
        preferences: get().preferences, // Keep preferences
    }),
}));

// Selectors - return primitives to avoid infinite re-render loops
export const selectCurrentStop = (state: TourState) =>
    state.route.stops[state.route.currentStopIndex] || null;

export const selectNextStop = (state: TourState) =>
    state.route.stops[state.route.currentStopIndex + 1] || null;

// Individual primitive selectors for progress (avoid returning new objects)
export const selectProgressCurrent = (state: TourState) => state.route.currentStopIndex + 1;
export const selectProgressTotal = (state: TourState) => state.route.stops.length;
export const selectProgressPercentage = (state: TourState) =>
    state.route.stops.length > 0
        ? ((state.route.currentStopIndex + 1) / state.route.stops.length) * 100
        : 0;

