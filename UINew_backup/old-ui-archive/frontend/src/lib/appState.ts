import { MoodType, MOOD_CONFIG, RecommendedSong } from '@/lib/types';

// ===== VIEWS =====
export type AppView = 'landing' | 'home' | 'search' | 'playing' | 'camera' | 'media' | 'timeline';

// ===== FEED DATA TYPES =====
export type HomeFeedData = {
    for_you: RecommendedSong[];
    last_played: RecommendedSong[];
    most_played: RecommendedSong[];
    mood_starter: RecommendedSong[];
    cold_start: boolean;
};

export type DiscoverFeedData = {
    fresh_picks: RecommendedSong[];
    timeless_classics: RecommendedSong[];
    trending: RecommendedSong[];
    suggested_mood: string;
};

// ===== CONSTANTS =====

/** Server-issued song ids from `/api/recommendations` are UUIDs — use for interact without upsert. */
export const SERVER_SONG_ID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Accent for SongCard when no mood is selected: prefer the song's tag, else a neutral default (not happy). */
export const FALLBACK_CARD_MOOD: MoodType = 'study';

// ===== HELPERS =====

export function mapApiRecommendationToSong(s: Record<string, unknown>): RecommendedSong {
    const id = String(s.id);
    const ytFromApi = s.youtube_id ? String(s.youtube_id) : undefined;
    const ext =
        ytFromApi ||
        (s.external_source === 'youtube' && s.external_id ? String(s.external_id) : undefined);
    return {
        id,
        title: String(s.title ?? ''),
        artist: String(s.artist ?? ''),
        album: (s.album as string | null | undefined) ?? null,
        genre: String(s.genre ?? ''),
        mood_tag: String(s.mood_tag ?? ''),
        duration: Number(s.duration ?? 0),
        cover_url: (s.cover_url as string | null | undefined) ?? null,
        audio_url: (s.audio_url as string | null | undefined) ?? null,
        preview_url: (s.preview_url as string | null | undefined) ?? null,
        youtube_id: ext,
        valence: Number(s.valence ?? 0.5),
        energy: Number(s.energy ?? 0.5),
        danceability: Number(s.danceability ?? 0.5),
        popularity: Number(s.popularity ?? 50),
        release_date: (s.release_date as string | null | undefined) ?? null,
        score: Number(s.score ?? 0),
        mood_match: Number(s.mood_match ?? 0),
        user_similarity: Number(s.user_similarity ?? 0),
    };
}

export function cardAccentMood(song: RecommendedSong, selected: MoodType | null): MoodType {
    const t = (song.mood_tag || '').toLowerCase();
    if (t && t in MOOD_CONFIG) return t as MoodType;
    return selected ?? FALLBACK_CARD_MOOD;
}

export function getSubMoods(mood: MoodType): string[] {
    const subMoods: Record<MoodType, string[]> = {
        happy: ['Euphoric', 'Chill', 'Groovy'],
        sad: ['Melancholic', 'Nostalgic', 'Healing'],
        gym: ['Intense', 'Cardio', 'Power'],
        study: ['Deep Focus', 'Ambient', 'Classical'],
        rock: ['Angry', 'Brooding', 'Determined'],
    };
    return subMoods[mood] || ['Angry', 'Brooding', 'Determined'];
}

export type NavTab = 'home' | 'search' | 'media' | 'timeline' | 'profile';
