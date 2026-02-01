import { GuidePersonality } from '@/store/tour';

export interface Character {
    id: GuidePersonality;
    name: string;
    tagline: string;
    description: string;
    initial: string;
    avatar: string;
}

export const CHARACTERS: Character[] = [
    {
        id: 'henry',
        name: 'Henry',
        tagline: 'The Friendly Local',
        description: 'Warm and welcoming, like exploring with a neighbor.',
        initial: 'H',
        avatar: '/avatars/henry.png' // Placeholder
    },
    {
        id: 'quentin',
        name: 'Quentin',
        tagline: 'The Professor',
        description: 'Deep dives into history and fascinating facts.',
        initial: 'Q',
        avatar: '/avatars/quentin.png' // Placeholder
    },
    {
        id: 'drew',
        name: 'Drew',
        tagline: 'The Explorer',
        description: 'Energetic and fun, always finding adventure.',
        initial: 'D',
        avatar: '/avatars/drew.png'
    },
    {
        id: 'autumn',
        name: 'Autumn',
        tagline: 'The Storyteller',
        description: 'Dramatic and evocative, bringing stories to life.',
        initial: 'A',
        avatar: '/avatars/autumn.png' // Placeholder
    },
];
