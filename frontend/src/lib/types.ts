export interface Song {
    id: string;
    title: string;
    artist: string;
    album: string | null;
    genre: string;
    mood_tag: string;
    duration: number;
    cover_url: string | null;
    audio_url: string | null;
    preview_url: string | null;
    valence: number;
    energy: number;
    danceability: number;
    popularity: number;
    release_date: string | null;
}

export interface RecommendedSong extends Song {
    score: number;
    mood_match: number;
    user_similarity: number;
    youtube_id?: string;
}

export interface User {
    id: string;
    username: string;
    email: string;
    created_at: string;
}

export interface TokenResponse {
    access_token: string;
    token_type: string;
    user: User;
}

export interface RecommendationResponse {
    mood: string;
    songs: RecommendedSong[];
    total: number;
    cached: boolean;
}

export interface MoodInfo {
    name: string;
    emoji: string;
    color: string;
    gradient: string[];
}

export interface MoodHistoryEntry {
    mood: string;
    source: string;
    confidence: number;
    timestamp: string;
}

export type MoodType = 'happy' | 'sad' | 'gym' | 'study' | 'rock' | 'fear';

export const MOOD_CONFIG: Record<MoodType, {
    emoji: string;
    label: string;
    color: string;
    gradient: string;
    bgClass: string;
    glowClass: string;
    icon: string;
    description: string;
}> = {
    happy: {
        emoji: '😊',
        label: 'Happy',
        color: '#FFD700',
        gradient: 'from-amber-500 to-yellow-300',
        bgClass: 'mood-bg-happy',
        glowClass: 'glow-happy',
        icon: '☀️',
        description: 'Upbeat, joyful, feel-good vibes',
    },
    sad: {
        emoji: '😢',
        label: 'Sad',
        color: '#4169E1',
        gradient: 'from-blue-700 to-indigo-500',
        bgClass: 'mood-bg-sad',
        glowClass: 'glow-sad',
        icon: '🌧️',
        description: 'Melancholic, emotional, introspective',
    },
    gym: {
        emoji: '💪',
        label: 'Gym',
        color: '#FF4500',
        gradient: 'from-red-600 to-orange-500',
        bgClass: 'mood-bg-gym',
        glowClass: 'glow-gym',
        icon: '🔥',
        description: 'High energy, pump up, power tracks',
    },
    study: {
        emoji: '📚',
        label: 'Study',
        color: '#2E8B57',
        gradient: 'from-emerald-700 to-teal-500',
        bgClass: 'mood-bg-study',
        glowClass: 'glow-study',
        icon: '🧠',
        description: 'Calm, focused, ambient & lo-fi',
    },
    rock: {
        emoji: '🎸',
        label: 'Rock',
        color: '#DC143C',
        gradient: 'from-red-800 to-rose-500',
        bgClass: 'mood-bg-rock',
        glowClass: 'glow-rock',
        icon: '⚡',
        description: 'Classic & modern rock, guitar-driven',
    },
    fear: {
        emoji: '😨',
        label: 'Fear',
        color: '#4B0082',
        gradient: 'from-purple-900 to-violet-600',
        bgClass: 'mood-bg-fear',
        glowClass: 'glow-fear',
        icon: '👻',
        description: 'Dark, eerie, suspenseful, cinematic',
    },
};

export function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}
