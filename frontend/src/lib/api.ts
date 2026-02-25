const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

class ApiClient {
    private token: string | null = null;

    constructor() {
        if (typeof window !== 'undefined') {
            this.token = localStorage.getItem('token');
        }
    }

    setToken(token: string) {
        this.token = token;
        if (typeof window !== 'undefined') {
            localStorage.setItem('token', token);
        }
    }

    clearToken() {
        this.token = null;
        if (typeof window !== 'undefined') {
            localStorage.removeItem('token');
        }
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...((options.headers as Record<string, string>) || {}),
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Request failed' }));
            throw new Error(error.detail || `HTTP ${response.status}`);
        }

        return response.json();
    }

    // Auth
    async register(username: string, email: string, password: string) {
        const data = await this.request<any>('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, password }),
        });
        this.setToken(data.access_token);
        return data;
    }

    async login(email: string, password: string) {
        const data = await this.request<any>('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
        this.setToken(data.access_token);
        return data;
    }

    async getMe() {
        return this.request<any>('/api/auth/me');
    }

    // Moods
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

    // Songs
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

    // Recommendations
    async getRecommendations(mood: string, limit: number = 20) {
        return this.request<any>(`/api/recommendations?mood=${mood}&limit=${limit}`);
    }

    // Health
    async healthCheck() {
        return this.request<any>('/api/health');
    }

    get isAuthenticated(): boolean {
        return !!this.token;
    }
}

export const api = new ApiClient();
