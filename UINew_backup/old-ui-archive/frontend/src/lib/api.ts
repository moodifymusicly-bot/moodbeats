const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export type TokenProvider = () => Promise<string | null>;

export interface UpsertSongInput {
    external_id: string;
    title: string;
    artist: string;
    duration: number;
    cover_url?: string | null;
    mood_tag?: string | null;
    album?: string | null;
    genre?: string | null;
}

export interface YouTubeSearchItem {
    external_id: string;
    title: string;
    artist: string;
    duration: number;
    cover_url: string | null;
}

export interface YouTubeSearchResponse {
    query: string;
    items: YouTubeSearchItem[];
    cached: boolean;
    fallback?: boolean;
}

export class ApiClient {
    private getToken: TokenProvider;

    constructor(getToken?: TokenProvider) {
        // No in-memory token cache. We always ask the token provider (Clerk)
        // so that refreshed short-lived JWTs flow through on every request.
        this.getToken = getToken ?? (async () => null);
    }

    setTokenProvider(provider: TokenProvider) {
        this.getToken = provider;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...((options.headers as Record<string, string>) || {}),
        };

        try {
            const token = await this.getToken();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
        } catch {
            // No token available (signed out); proceed anonymously. Endpoints that
            // require auth will 401 and UI can prompt sign-in.
        }

        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers,
        });

        if (!response.ok) {
            let error: { detail?: string } = {};
            try {
                error = await response.json();
            } catch {
                error = { detail: `HTTP ${response.status}` };
            }
            throw new Error(error.detail || `HTTP ${response.status}`);
        }

        if (response.status === 204) {
            return undefined as unknown as T;
        }
        return response.json();
    }

    // ===== Auth =====
    async getMe() {
        return this.request<any>('/api/auth/me');
    }

    // ===== Moods =====
    async getMoods() {
        return this.request<any[]>('/api/moods');
    }

    async selectMood(mood: string, source: string = 'manual', confidence: number = 1.0) {
        return this.request<any>('/api/moods/select', {
            method: 'POST',
            body: JSON.stringify({ mood, source, confidence }),
        });
    }

    async getMoodHistory() {
        return this.request<any[]>('/api/moods/history');
    }

    // ===== Songs =====
    async getSongs(params: { page?: number; per_page?: number; mood?: string; search?: string } = {}) {
        const query = new URLSearchParams();
        if (params.page) query.set('page', String(params.page));
        if (params.per_page) query.set('per_page', String(params.per_page));
        if (params.mood) query.set('mood', params.mood);
        if (params.search) query.set('search', params.search);
        return this.request<any>(`/api/songs?${query.toString()}`);
    }

    async getSong(id: string) {
        return this.request<any>(`/api/songs/${id}`);
    }

    async upsertSong(input: UpsertSongInput) {
        return this.request<any>('/api/songs/upsert', {
            method: 'POST',
            body: JSON.stringify(input),
        });
    }

    async interactWithSong(songId: string, type: string, duration?: number) {
        return this.request<any>(`/api/songs/${songId}/interact`, {
            method: 'POST',
            body: JSON.stringify({
                song_id: songId,
                interaction_type: type,
                listen_duration: duration,
            }),
        });
    }

    // ===== Recommendations =====
    async getRecommendations(mood: string, limit: number = 20) {
        return this.request<any>(`/api/recommendations?mood=${encodeURIComponent(mood)}&limit=${limit}`);
    }

    /** Authenticated: mood-agnostic personalized feed from interaction history. */
    async getForYouRecommendations(limit: number = 20) {
        return this.request<any>(`/api/recommendations/for-you?limit=${limit}`);
    }

    /** Discovery feed: fresh picks, timeless classics, trending. Works for anonymous + signed-in. */
    async getDiscoverFeed(params: { mood?: string; limit?: number } = {}) {
        const q = new URLSearchParams();
        if (params.mood) q.set('mood', params.mood);
        if (params.limit != null) q.set('limit', String(params.limit));
        const qs = q.toString();
        return this.request<any>(`/api/recommendations/discover${qs ? `?${qs}` : ''}`);
    }

    /** Authenticated: home bundle (for-you, last/most played, optional mood starter). */
    async getHomeRecommendations(params: {
        starter_mood?: string;
        mood_limit?: number;
        foryou_limit?: number;
        history_limit?: number;
    } = {}) {
        const q = new URLSearchParams();
        if (params.starter_mood) q.set('starter_mood', params.starter_mood);
        if (params.mood_limit != null) q.set('mood_limit', String(params.mood_limit));
        if (params.foryou_limit != null) q.set('foryou_limit', String(params.foryou_limit));
        if (params.history_limit != null) q.set('history_limit', String(params.history_limit));
        const qs = q.toString();
        return this.request<any>(`/api/recommendations/home${qs ? `?${qs}` : ''}`);
    }

    // ===== Library (likes + playlists) =====
    async getLikes() {
        return this.request<any[]>('/api/library/likes');
    }

    async likeSong(songId: string) {
        return this.request<any>(`/api/library/likes/${songId}`, { method: 'POST' });
    }

    async unlikeSong(songId: string) {
        return this.request<any>(`/api/library/likes/${songId}`, { method: 'DELETE' });
    }

    async getPlaylists() {
        return this.request<any[]>('/api/library/playlists');
    }

    async createPlaylist(name: string) {
        return this.request<any>('/api/library/playlists', {
            method: 'POST',
            body: JSON.stringify({ name }),
        });
    }

    async deletePlaylist(playlistId: string) {
        return this.request<any>(`/api/library/playlists/${playlistId}`, { method: 'DELETE' });
    }

    async getPlaylist(playlistId: string) {
        return this.request<any>(`/api/library/playlists/${playlistId}`);
    }

    async addSongToPlaylist(playlistId: string, songId: string) {
        return this.request<any>(`/api/library/playlists/${playlistId}/songs`, {
            method: 'POST',
            body: JSON.stringify({ song_id: songId }),
        });
    }

    async removeSongFromPlaylist(playlistId: string, songId: string) {
        return this.request<any>(`/api/library/playlists/${playlistId}/songs/${songId}`, {
            method: 'DELETE',
        });
    }

    // ===== YouTube (server-side proxy; key never ships to browser) =====
    async searchYouTube(q: string, limit: number = 12): Promise<YouTubeSearchResponse> {
        const query = new URLSearchParams({ q, limit: String(limit) });
        return this.request<YouTubeSearchResponse>(`/api/youtube/search?${query.toString()}`);
    }

    // ===== YouTube Health =====
    async youtubeHealth(): Promise<{ configured: boolean; valid: boolean; error?: string }> {
        return this.request<{ configured: boolean; valid: boolean; error?: string }>('/api/youtube/health');
    }

    // ===== Health =====
    async healthCheck() {
        return this.request<any>('/api/health');
    }
}

// Default singleton (anonymous). Client components should obtain an authenticated
// client via `useApi()` (see `src/lib/useApi.ts`).
export const api = new ApiClient();
