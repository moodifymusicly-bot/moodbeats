'use client';
import LandingView from "@/views/LandingView";
import HomeView from "@/views/HomeView";
import SearchView from "@/views/SearchView";
import PlayingView from "@/views/PlayingView";
import TimelinePageView from "@/views/TimelinePageView";
import SettingsPanel from "@/components/SettingsPanel";
import { mapApiRecommendationToSong, AppView, HomeFeedData, DiscoverFeedData, cardAccentMood, FALLBACK_CARD_MOOD, getSubMoods, SERVER_SONG_ID_RE } from "@/lib/appState";

import { useState, useEffect, useRef, useCallback, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser, useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useApi } from '@/lib/useApi';
const FaceCamera = dynamic(() => import('@/components/FaceCamera'), { ssr: false });
import YouTubePlayer from '@/components/YouTubePlayer';
import { MoodTimelineEntry, addMoodEntry } from '@/components/MoodTimeline';
import TimelineView from '@/components/TimelineView';
import SongCard from '@/components/SongCard';
import CameraPage from '@/components/CameraPage';
import UserMenu from '@/components/UserMenu';
import PlaylistManager, { Playlist, AddToPlaylistPopover } from '@/components/PlaylistManager';
import { MoodType, MOOD_CONFIG, RecommendedSong, formatDuration } from '@/lib/types';

const ShaderBackground = dynamic(() => import('@/components/ShaderBackground'), { ssr: false });
const StarDropBackground = dynamic(() => import('@/components/StarDropBackground'), { ssr: false });

/** Server-issued song ids from `/api/recommendations` are UUIDs — use for interact without upsert. */
/** Accent for SongCard when no mood is selected: prefer the song's tag, else a neutral default (not happy). */
// ===== VIEWS =====
export default function Home() {
    const { user, isSignedIn } = useUser();
    const { signOut, openSignIn } = useClerk();
    const router = useRouter();
    const api = useApi();

    const [view, setView] = useState<AppView>('landing');
    const [selectedMood, setSelectedMood] = useState<MoodType | null>(null);
    const [songs, setSongs] = useState<RecommendedSong[]>([]);
    const [currentSong, setCurrentSong] = useState<RecommendedSong | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [autoplayBlocked, setAutoplayBlocked] = useState(false);
    const [cameraActive, setCameraActive] = useState(false);
    const [detectedEmotion, setDetectedEmotion] = useState<string | null>(null);
    const [detectedConfidence, setDetectedConfidence] = useState(0);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [activeNav, setActiveNav] = useState<'home' | 'search' | 'media' | 'timeline' | 'profile'>('home');
    const [artistFilter, setArtistFilter] = useState('');
    const [isCinemaMode, setIsCinemaMode] = useState(false);
    const [videoRotation, setVideoRotation] = useState(0);
    const [isDetecting, setIsDetecting] = useState(false);
    const [moodHistory, setMoodHistory] = useState<MoodTimelineEntry[]>([]);
    const [landscapeMode, setLandscapeMode] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);
    const homeFeedFetchedAt = useRef<number>(0);
    const ytIdCacheRef = useRef<Map<string, string>>(new Map());

    const [youtubeResults, setYoutubeResults] = useState<RecommendedSong[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [selectedSubMood, setSelectedSubMood] = useState<string | null>(null);
    const [subMoodLoading, setSubMoodLoading] = useState(false);
    const [moodRecLoading, setMoodRecLoading] = useState(false);
    const [homeFeed, setHomeFeed] = useState<HomeFeedData | null>(null);
    const [homeFeedLoading, setHomeFeedLoading] = useState(false);
    const [discoverFeed, setDiscoverFeed] = useState<DiscoverFeedData | null>(null);
    const [discoverLoading, setDiscoverLoading] = useState(false);

    const [recentlyPlayedLocal, setRecentlyPlayedLocal] = useState<RecommendedSong[]>([]);

    // Clerk auth + user preferences
    const [likedSongs, setLikedSongs] = useState<Set<string>>(new Set());
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [showPlaylistManager, setShowPlaylistManager] = useState(false);
    const [playlistManager, setPlaylistManager] = useState<{ isOpen: boolean, song: RecommendedSong | null }>({ isOpen: false, song: null });
    const [addToPlaylistSong, setAddToPlaylistSong] = useState<RecommendedSong | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [dataSaver, setDataSaver] = useState(false);
    const [showBackgroundEffects, setShowBackgroundEffects] = useState(true);
    const [autoPlayNext, setAutoPlayNext] = useState(true);
    const userId = user?.id || 'anon';

    // Maps frontend song.id (e.g. "sample-happy-0" or "yt-VIDEOID") to the
    // canonical server UUID returned from /api/songs/upsert, so we only upsert
    // a given song once per session.
    const songIdMapRef = useRef<Map<string, string>>(new Map());

    // Resolve (and cache) the backend UUID for a song. Seed songs and YouTube
    // results are upserted server-side; the returned id is used for likes,
    // interactions, and playlist membership on the backend.
    const resolveServerSongId = useCallback(async (song: RecommendedSong): Promise<string | null> => {
        const cached = songIdMapRef.current.get(song.id);
        if (cached) return cached;
        if (SERVER_SONG_ID_RE.test(song.id)) {
            songIdMapRef.current.set(song.id, song.id);
            return song.id;
        }
        const external_id = song.youtube_id || song.id;
        if (!external_id) return null;
        try {
            const res = await api.upsertSong({
                external_id,
                title: song.title,
                artist: song.artist,
                duration: song.duration || 0,
                cover_url: song.cover_url,
                mood_tag: song.mood_tag || null,
                album: song.album || null,
                genre: song.genre || null,
            });
            const serverId = res?.id;
            if (serverId) songIdMapRef.current.set(song.id, serverId);
            return serverId ?? null;
        } catch (err) {
            console.warn('upsertSong failed', err);
            return null;
        }
    }, [api]);

    const loadRecommendationsForMood = useCallback(
        async (mood: MoodType): Promise<RecommendedSong[]> => {
            try {
                const lim = isSignedIn ? 20 : 12;
                const data = await api.getRecommendations(mood, lim);
                let mapped = (data?.songs ?? []).map((s: Record<string, unknown>) =>
                    mapApiRecommendationToSong(s)
                );
                if (mapped.length === 0) {
                    const yt = await api.searchYouTube(`${MOOD_CONFIG[mood].label} music`, 15);
                    mapped = (yt.items || []).map((item, i) => ({
                        id: `yt-fb-${item.external_id}`,
                        title: item.title,
                        artist: item.artist,
                        album: '',
                        genre: mood,
                        mood_tag: mood,
                        duration: item.duration || 0,
                        cover_url: item.cover_url,
                        audio_url: null,
                        preview_url: null,
                        youtube_id: item.external_id,
                        valence: 0.5,
                        energy: 0.5,
                        danceability: 0.5,
                        popularity: 50,
                        release_date: null,
                        score: 1 - i * 0.02,
                        mood_match: 0.5,
                        user_similarity: 0.5,
                    }));
                }
                return [...mapped].sort((a, b) => {
                    const aLiked = likedSongs.has(a.id) ? 0.2 : 0;
                    const bLiked = likedSongs.has(b.id) ? 0.2 : 0;
                    return b.score + bLiked - (a.score + aLiked);
                });
            } catch (err) {
                console.warn('loadRecommendationsForMood failed', err);
                return [];
            }
        },
        [api, likedSongs, isSignedIn]
    );

    const loadHomeFeed = useCallback(async (force = false) => {
        if (!isSignedIn) return;
        // Skip re-fetch if data is fresh (< 60 s old) unless forced
        if (!force && homeFeedFetchedAt.current > 0 && Date.now() - homeFeedFetchedAt.current < 60_000) return;
        setHomeFeedLoading(true);
        try {
            const data = await api.getHomeRecommendations({
                mood_limit: 8,
                foryou_limit: 10,
                history_limit: 6,
            });
            const map = (rows: Record<string, unknown>[]) =>
                rows.map((s) => mapApiRecommendationToSong(s));
            setHomeFeed({
                for_you: map(data.for_you ?? []),
                last_played: map(data.last_played ?? []),
                most_played: map(data.most_played ?? []),
                mood_starter: map(data.mood_starter ?? []),
                cold_start: Boolean(data.cold_start),
            });
            homeFeedFetchedAt.current = Date.now();
        } catch (e) {
            console.warn('loadHomeFeed failed', e);
            setHomeFeed(null);
        } finally {
            setHomeFeedLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [api, isSignedIn]);

    const loadDiscoverFeed = useCallback(async () => {
        setDiscoverLoading(true);
        try {
            const data = await api.getDiscoverFeed({ limit: 8 });
            const map = (rows: Record<string, unknown>[]) =>
                rows.map((s) => mapApiRecommendationToSong(s));
            setDiscoverFeed({
                fresh_picks: map(data.fresh_picks ?? []),
                timeless_classics: map(data.timeless_classics ?? []),
                trending: map(data.trending ?? []),
                suggested_mood: data.suggested_mood || 'neutral',
            });
        } catch (e) {
            console.warn('loadDiscoverFeed failed', e);
        } finally {
            setDiscoverLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [api]);

    useEffect(() => {
        if (view === 'home' && isSignedIn) void loadHomeFeed();
    }, [view, isSignedIn, loadHomeFeed]);

    useEffect(() => {
        if (view === 'home') void loadDiscoverFeed();
    }, [view, loadDiscoverFeed]);

    // Load settings from localStorage on mount (settings stay local-only).
    useEffect(() => {
        try {
            const settings = localStorage.getItem(`settings_${userId}`);
            if (settings) {
                const s = JSON.parse(settings);
                if (typeof s.dataSaver === 'boolean') setDataSaver(s.dataSaver);
                if (typeof s.showBackgroundEffects === 'boolean') setShowBackgroundEffects(s.showBackgroundEffects);
                if (typeof s.autoPlayNext === 'boolean') setAutoPlayNext(s.autoPlayNext);
            }
        } catch { }
    }, [userId]);

    // Load likes/playlists from the backend when signed in (server is source of
    // truth); fall back to localStorage cache otherwise. On successful fetch we
    // refresh the localStorage cache so offline reloads stay consistent.
    useEffect(() => {
        let cancelled = false;
        const hydrate = async () => {
            if (!isSignedIn) {
                try {
                    const liked = localStorage.getItem(`liked_songs_${userId}`);
                    if (liked) setLikedSongs(new Set(JSON.parse(liked)));
                    const pls = localStorage.getItem(`playlists_${userId}`);
                    if (pls) setPlaylists(JSON.parse(pls));
                } catch { }
                return;
            }
            try {
                const [likesRes, playlistsRes] = await Promise.all([
                    api.getLikes().catch(() => []),
                    api.getPlaylists().catch(() => []),
                ]);
                if (cancelled) return;

                const likeIds = new Set<string>();
                for (const row of likesRes || []) {
                    const serverId = row?.song?.id;
                    const ext = row?.song?.external_id;
                    const src = row?.song?.external_source;
                    if (serverId) {
                        const frontendId = src === 'youtube' && ext ? `yt-${ext}` : (ext || serverId);
                        likeIds.add(frontendId);
                        songIdMapRef.current.set(frontendId, serverId);
                    }
                }
                setLikedSongs(likeIds);
                localStorage.setItem(`liked_songs_${userId}`, JSON.stringify(Array.from(likeIds)));

                const mappedPlaylists: Playlist[] = (playlistsRes || []).map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    createdAt: p.created_at || new Date().toISOString(),
                    songs: (p.songs || []).map((s: any) => {
                        const frontendId = s.external_source === 'youtube' && s.external_id
                            ? `yt-${s.external_id}`
                            : (s.external_id || s.id);
                        songIdMapRef.current.set(frontendId, s.id);
                        return {
                            id: frontendId,
                            title: s.title,
                            artist: s.artist,
                            album: s.album || '',
                            genre: s.genre || '',
                            mood_tag: s.mood_tag || '',
                            duration: s.duration || 0,
                            cover_url: s.cover_url || null,
                            audio_url: s.audio_url || null,
                            preview_url: s.preview_url || null,
                            youtube_id: s.external_source === 'youtube' ? s.external_id : undefined,
                            valence: s.valence ?? 0.5,
                            energy: s.energy ?? 0.5,
                            danceability: s.danceability ?? 0.5,
                            popularity: s.popularity ?? 50,
                            release_date: null,
                            score: 0.5,
                            mood_match: 0.5,
                            user_similarity: 0.5,
                        } as RecommendedSong;
                    }),
                }));
                setPlaylists(mappedPlaylists);
                localStorage.setItem(`playlists_${userId}`, JSON.stringify(mappedPlaylists));
            } catch (err) {
                console.warn('Library hydration failed:', err);
            }
        };
        hydrate();
        return () => { cancelled = true; };
    }, [isSignedIn, userId, api]);

    const persistSettings = useCallback((updates: { dataSaver?: boolean; showBackgroundEffects?: boolean; autoPlayNext?: boolean }) => {
        try {
            const raw = localStorage.getItem(`settings_${userId}`);
            const current = raw ? JSON.parse(raw) : {};
            localStorage.setItem(`settings_${userId}`, JSON.stringify({ ...current, ...updates }));
        } catch { }
    }, [userId]);

    const toggleDataSaver = useCallback((val: boolean) => {
        setDataSaver(val);
        persistSettings({ dataSaver: val });
    }, [persistSettings]);

    const toggleBackgroundEffects = useCallback((val: boolean) => {
        setShowBackgroundEffects(val);
        persistSettings({ showBackgroundEffects: val });
    }, [persistSettings]);

    const toggleAutoPlayNext = useCallback((val: boolean) => {
        setAutoPlayNext(val);
        persistSettings({ autoPlayNext: val });
    }, [persistSettings]);

    // Optimistic like toggle: update UI immediately, then persist to backend.
    // Server is source of truth; localStorage is a write-through cache.
    const toggleLikeSong = useCallback((songId: string, songData?: RecommendedSong) => {
        let wasLiked = false;
        setLikedSongs(prev => {
            const next = new Set(prev);
            wasLiked = next.has(songId);
            if (wasLiked) next.delete(songId);
            else next.add(songId);
            localStorage.setItem(`liked_songs_${userId}`, JSON.stringify(Array.from(next)));
            return next;
        });
        toast(wasLiked ? 'Removed from liked' : 'Added to liked', {
            icon: wasLiked ? '\u{1F494}' : '\u{2764}\u{FE0F}',
        });
        if (!isSignedIn) return;
        (async () => {
            try {
                let serverId = songIdMapRef.current.get(songId);
                if (!serverId && songData) {
                    serverId = (await resolveServerSongId(songData)) ?? undefined;
                }
                if (!serverId) return;
                if (wasLiked) await api.unlikeSong(serverId);
                else await api.likeSong(serverId);
            } catch (err) {
                console.warn('like sync failed', err);
            }
        })();
    }, [userId, isSignedIn, api, resolveServerSongId]);

    // Playlist handlers. When signed in we round-trip to the server and use
    // the returned id; otherwise we fall back to a local-only id.
    const handleCreatePlaylist = useCallback(async (name: string) => {
        if (isSignedIn) {
            try {
                const pl = await api.createPlaylist(name);
                const newPl: Playlist = {
                    id: pl.id,
                    name: pl.name,
                    songs: [],
                    createdAt: pl.created_at || new Date().toISOString(),
                };
                setPlaylists(prev => {
                    const next = [...prev, newPl];
                    localStorage.setItem(`playlists_${userId}`, JSON.stringify(next));
                    return next;
                });
                return;
            } catch (err) {
                console.warn('createPlaylist failed', err);
            }
        }
        const newPl: Playlist = { id: `pl-${Date.now()}`, name, songs: [], createdAt: new Date().toISOString() };
        setPlaylists(prev => {
            const next = [...prev, newPl];
            localStorage.setItem(`playlists_${userId}`, JSON.stringify(next));
            return next;
        });
    }, [userId, isSignedIn, api]);

    const handleDeletePlaylist = useCallback((id: string) => {
        setPlaylists(prev => {
            const next = prev.filter(p => p.id !== id);
            localStorage.setItem(`playlists_${userId}`, JSON.stringify(next));
            return next;
        });
        if (isSignedIn) {
            api.deletePlaylist(id).catch(err => console.warn('deletePlaylist failed', err));
        }
    }, [userId, isSignedIn, api]);

    const handleAddToPlaylist = useCallback(async (playlistId: string, song: RecommendedSong) => {
        setPlaylists(prev => {
            const playlist = prev.find(p => p.id === playlistId);
            if (playlist && !playlist.songs.some(s => s.id === song.id)) {
                toast(`Added to "${playlist.name}"`, { icon: '\u{1F3B6}' });
            }
            const next = prev.map(p =>
                p.id === playlistId && !p.songs.some(s => s.id === song.id)
                    ? { ...p, songs: [...p.songs, song] }
                    : p
            );
            localStorage.setItem(`playlists_${userId}`, JSON.stringify(next));
            return next;
        });
        if (!isSignedIn) return;
        try {
            const serverId = await resolveServerSongId(song);
            if (serverId) await api.addSongToPlaylist(playlistId, serverId);
        } catch (err) {
            console.warn('addSongToPlaylist failed', err);
        }
    }, [userId, isSignedIn, api, resolveServerSongId]);


    const toggleCinemaMode = async () => {
        if (!isCinemaMode) {
            setIsCinemaMode(true);
            try {
                if (document.documentElement.requestFullscreen) {
                    await document.documentElement.requestFullscreen();
                }
                if (window.screen && window.screen.orientation && (window.screen.orientation as any).lock) {
                    await (window.screen.orientation as any).lock('landscape').catch(() => { });
                }
            } catch (e) { console.warn("Fullscreen API block"); }
        } else {
            setIsCinemaMode(false);
            try {
                if (document.exitFullscreen && document.fullscreenElement) {
                    await document.exitFullscreen();
                }
                if (window.screen && window.screen.orientation && window.screen.orientation.unlock) {
                    window.screen.orientation.unlock();
                }
            } catch (e) { console.warn("Exit Fullscreen API block"); }
        }
    };

    // Reset home page state on every visit
    const resetHomeState = () => {
        setSelectedMood(null);
        setSongs([]);
        setMoodRecLoading(false);
        setIsMuted(false);
        setAutoplayBlocked(false);
        setCameraActive(false);
        setIsDetecting(false);
        setDetectedEmotion(null);
        setDetectedConfidence(0);
        setArtistFilter('');
    };

    const handleMoodSelect = async (
        mood: MoodType,
        source: 'camera' | 'manual' = 'manual',
        confidence: number = 1.0
    ) => {
        setSelectedMood(mood);
        setSelectedSubMood(null);
        setMoodRecLoading(true);
        // NAV-3: Keep existing songs visible while loading (no clear before fetch)
        try {
            const boosted = await loadRecommendationsForMood(mood);
            setSongs(boosted);
        } finally {
            setMoodRecLoading(false);
        }
        const updated = addMoodEntry(mood, source, confidence);
        setMoodHistory(updated);

        if (isSignedIn) {
            api.selectMood(mood, source, confidence).catch((err) =>
                console.warn('selectMood failed', err)
            );
        }
    };

    const handleCameraMood = async (mood: MoodType, conf: number) => {
        setDetectedEmotion(MOOD_CONFIG[mood].label);
        setDetectedConfidence(Math.round(conf * 100));
        setSelectedMood(mood);
        setSelectedSubMood(null);
        setIsDetecting(false);
        setCameraActive(false);

        setMoodRecLoading(true);
        try {
            const boosted = await loadRecommendationsForMood(mood);
            setSongs(boosted);
            const updated = addMoodEntry(mood, 'camera', conf);
            setMoodHistory(updated);
            if (isSignedIn) {
                api.selectMood(mood, 'camera', conf).catch((err) =>
                    console.warn('selectMood failed', err)
                );
            }
            if (boosted.length === 0) {
                toast.error('No songs found for this mood. Try again or select a mood manually.');
            } else {
                const filtered = artistFilter.trim()
                    ? boosted.filter((s) => s.artist.toLowerCase().includes(artistFilter.toLowerCase()))
                    : boosted;
                const playList = filtered.length > 0 ? filtered : boosted;
                setIsMuted(true);
                const played = await handleAutoPlayFromCandidates(playList, { startMuted: true });
                if (!played) {
                    setIsMuted(false);
                    toast.error('Could not start playback for this mood. Please tap any song to play.');
                }
            }
        } finally {
            setMoodRecLoading(false);
        }
    };

    const resolvePlayableSong = useCallback(async (song: RecommendedSong): Promise<RecommendedSong | null> => {
        let resolved: RecommendedSong = { ...song };
        if (!resolved.youtube_id && !resolved.audio_url) {
            // PERF-2: Check in-memory and localStorage cache before hitting API
            const cachedYtId =
                ytIdCacheRef.current.get(song.id) ??
                (() => { try { return localStorage.getItem(`yt_id:${song.id}`) ?? undefined; } catch { return undefined; } })();
            if (cachedYtId) {
                resolved = { ...resolved, youtube_id: cachedYtId };
            } else {
                try {
                    const data = await api.searchYouTube(`${resolved.title} ${resolved.artist}`, 1);
                    const first = data.items?.[0];
                    if (first?.external_id) {
                        resolved = { ...resolved, youtube_id: first.external_id };
                        ytIdCacheRef.current.set(song.id, first.external_id);
                        try { localStorage.setItem(`yt_id:${song.id}`, first.external_id); } catch { }
                    }
                } catch (err) {
                    console.warn('YouTube resolve for playback failed', err);
                }
            }
        }
        if (!resolved.youtube_id && !resolved.audio_url) return null;
        return resolved;
    }, [api]);

    const handleSongPlay = useCallback(async (
        song: RecommendedSong,
        options: { startMuted?: boolean } = {}
    ): Promise<boolean> => {
        const startMuted = options.startMuted ?? false;
        setAutoplayBlocked(false);
        setIsMuted(startMuted);
        const resolved = await resolvePlayableSong(song);
        if (!resolved) {
            toast.error('This track is currently unavailable for playback.');
            return false;
        }

        setCurrentSong(resolved);
        setIsPlaying(true);
        setView('playing');
        setProgress(0);

        try {
            const MAX_RECENT = 20;
            const prev: RecommendedSong[] = JSON.parse(localStorage.getItem('recently_played_songs') || '[]');
            const deduped = prev.filter((s) => s.id !== resolved.id);
            const updated = [resolved, ...deduped].slice(0, MAX_RECENT);
            localStorage.setItem('recently_played_songs', JSON.stringify(updated));
            setRecentlyPlayedLocal(updated);
        } catch {
            /* ignore */
        }

        if (isSignedIn) {
            try {
                const serverId = await resolveServerSongId(resolved);
                if (serverId) await api.interactWithSong(serverId, 'play');
                void loadHomeFeed();
            } catch (err) {
                console.warn('play interaction failed', err);
            }
        }
        return true;
    }, [isSignedIn, resolveServerSongId, api, loadHomeFeed, resolvePlayableSong]);

    const handleAutoPlayFromCandidates = useCallback(async (
        candidates: RecommendedSong[],
        options: { startMuted?: boolean } = {}
    ): Promise<boolean> => {
        if (candidates.length === 0) return false;
        const immediate = candidates.find((s) => Boolean(s.audio_url || s.youtube_id));
        if (immediate) return handleSongPlay(immediate, options);

        // Bounded resolve attempts so camera flow doesn't stall on long lists.
        const limit = Math.min(5, candidates.length);
        for (let i = 0; i < limit; i++) {
            const resolved = await resolvePlayableSong(candidates[i]);
            if (resolved) {
                return handleSongPlay(resolved, options);
            }
        }
        return false;
    }, [handleSongPlay, resolvePlayableSong]);

    const handleSubMoodSelect = async (subMood: string) => {
        const mood = selectedMood ?? FALLBACK_CARD_MOOD;
        setSelectedSubMood(subMood);
        setSubMoodLoading(true);

        try {
            const q = `${MOOD_CONFIG[mood].label} ${subMood} music`;
            const data = await api.searchYouTube(q, 15);
            const mapped: RecommendedSong[] = (data.items || []).map((item, i) => ({
                id: `yt-sub-${item.external_id}`,
                title: item.title,
                artist: item.artist,
                album: '',
                genre: mood,
                mood_tag: mood,
                duration: item.duration || 0,
                cover_url: item.cover_url,
                audio_url: null,
                preview_url: null,
                youtube_id: item.external_id,
                valence: 0.5,
                energy: 0.5,
                danceability: 0.5,
                popularity: 50,
                release_date: null,
                score: 1 - i * 0.02,
                mood_match: 0.5,
                user_similarity: 0.5,
            }));

            if (mapped.length > 0) {
                setSongs(mapped);
                void handleSongPlay(mapped[0]);
            }
        } catch (err) {
            console.warn('Sub-mood search failed:', err);
        }
        setSubMoodLoading(false);
    };

    const handleNext = () => {
        if (!currentSong) return;
        const idx = songs.findIndex(s => s.id === currentSong.id);
        if (idx < songs.length - 1) void handleSongPlay(songs[idx + 1]);
    };

    const handlePrev = () => {
        if (!currentSong) return;
        const idx = songs.findIndex(s => s.id === currentSong.id);
        if (idx > 0) void handleSongPlay(songs[idx - 1]);
    };

    const moodColor = selectedMood ? MOOD_CONFIG[selectedMood].color : '#3b82f6';
    const compactDetectedMood = Boolean(selectedMood && (songs.length > 0 || moodRecLoading));

    const handlePlayPlaylist = useCallback((playlist: Playlist) => {
        if (playlist.songs.length === 0) return;
        setSongs(playlist.songs);
        void handleAutoPlayFromCandidates(playlist.songs).then((played) => {
            if (!played) {
                toast.error('No playable tracks found in this playlist.');
            }
        });
        setShowPlaylistManager(false);
    }, [handleAutoPlayFromCandidates]);

    // Sync audio play/pause state
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (isPlaying) {
            audio.play().catch(() => { });
        } else {
            audio.pause();
        }
    }, [isPlaying, currentSong]);

    // Load mood history from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem('mood_timeline');
            if (stored) {
                const cutoff = Date.now() - 24 * 60 * 60 * 1000;
                const entries: MoodTimelineEntry[] = JSON.parse(stored).filter(
                    (e: MoodTimelineEntry) => new Date(e.timestamp).getTime() > cutoff
                );
                setMoodHistory(entries);
            }
        } catch { }
    }, []);

    // Load recently played songs from localStorage on mount (works for all users)
    useEffect(() => {
        try {
            const stored = localStorage.getItem('recently_played_songs');
            if (stored) {
                const parsed: RecommendedSong[] = JSON.parse(stored);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setRecentlyPlayedLocal(parsed);
                }
            }
        } catch { }
    }, []);

    useEffect(() => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

        if (!searchQuery.trim()) {
            setYoutubeResults([]);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        searchTimerRef.current = setTimeout(async () => {
            try {
                const data = await api.searchYouTube(searchQuery, 20);
                const mapped: RecommendedSong[] = (data.items || []).map((item, i) => ({
                    id: `yt-${item.external_id}`,
                    title: item.title,
                    artist: item.artist,
                    album: '',
                    genre: '',
                    mood_tag: '',
                    duration: item.duration || 0,
                    cover_url: item.cover_url,
                    audio_url: null,
                    preview_url: null,
                    youtube_id: item.external_id,
                    valence: 0.5,
                    energy: 0.5,
                    danceability: 0.5,
                    popularity: 50,
                    release_date: null,
                    score: 1 - i * 0.02,
                    mood_match: 0.5,
                    user_similarity: 0.5,
                }));
                setYoutubeResults(mapped);
            } catch (err) {
                console.warn('YouTube search failed:', err);
                setYoutubeResults([]);
            }
            setIsSearching(false);
        }, 500);

        return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
    }, [searchQuery, api]);

    const handleRotateVideo = () => {
        setVideoRotation((prev) => (prev + 90) % 360);
    };



    const handleRemoveSongFromPlaylist = useCallback((playlistId: string, songId: string) => {
        setPlaylists(prev => {
            const next = prev.map(p =>
                p.id === playlistId
                    ? { ...p, songs: p.songs.filter(s => s.id !== songId) }
                    : p
            );
            localStorage.setItem(`playlists_${userId}`, JSON.stringify(next));
            return next;
        });
        if (isSignedIn) {
            const serverId = songIdMapRef.current.get(songId) || songId;
            api.removeSongFromPlaylist(playlistId, serverId).catch(err =>
                console.warn('removeSongFromPlaylist failed', err)
            );
        }
    }, [userId, isSignedIn, api]);

    return (
        <main className="min-h-[100dvh] bg-[#0a0a0f] text-white overflow-x-hidden relative pb-[var(--nav-height)]">
            <div className="absolute inset-0 bg-gradient-to-b from-purple-900/10 via-black to-black pointer-events-none" />

            <AnimatePresence mode="wait">
                {view === 'landing' && (
                    <LandingView onEnter={() => { resetHomeState(); setView('home'); }} />
                )}
                {view === 'home' && (
                    <HomeView
                        isSignedIn={!!isSignedIn}
                        userName={user?.firstName || user?.username || 'Guest'}
                        userImage={user?.imageUrl || null}
                        onSignIn={() => router.push('/sign-in')}
                        onSignOut={() => signOut()}
                        selectedMood={selectedMood}
                        moodColor={moodColor}
                        detectedConfidence={detectedConfidence}
                        cameraActive={cameraActive}
                        isDetecting={isDetecting}
                        moodRecLoading={moodRecLoading}
                        onMoodSelect={handleMoodSelect}
                        onCameraStart={() => setCameraActive(true)}
                        onCameraStop={() => { setCameraActive(false); setIsDetecting(false); }}
                        onDetectStart={() => setIsDetecting(true)}
                        onDetectStop={() => setIsDetecting(false)}
                        onCameraMood={handleCameraMood}
                        songs={songs}
                        artistFilter={artistFilter}
                        onArtistFilterChange={setArtistFilter}
                        onSongPlay={handleSongPlay}
                        onLikeSong={toggleLikeSong}
                        likedSongs={likedSongs}
                        onAddToPlaylist={(song) => setPlaylistManager({ isOpen: true, song })}
                        homeFeed={homeFeed}
                        homeFeedLoading={homeFeedLoading}
                        discoverFeed={discoverFeed}
                        discoverLoading={discoverLoading}
                        recentlyPlayedLocal={recentlyPlayedLocal}
                        currentSong={currentSong}
                        isPlaying={isPlaying}
                        progress={progress}
                        duration={duration}
                        activeNav={view}
                        onNavHome={() => setView('home')}
                        onNavSearch={() => setView('search')}
                        onNavTimeline={() => setView('timeline')}
                        onNavLanding={() => setView('landing')}
                        onResetHome={resetHomeState}
                        onExpandPlayer={() => setView('playing')}
                        onPlayPause={() => setIsPlaying(!isPlaying)}
                        onPrev={handlePrev}
                        onNext={handleNext}
                        onClosePlayer={() => { setCurrentSong(null); setIsPlaying(false); }}
                        onPlaylist={() => setShowPlaylistManager(true)}
                        onSettings={() => setShowSettings(true)}
                        showPlaylistManager={showPlaylistManager}
                        showSettings={showSettings}
                        playlistCount={playlists.length}
                    />
                )}
                {view === 'search' && (
                    <SearchView
                        searchQuery={searchQuery}
                        onSearchQueryChange={setSearchQuery}
                        youtubeResults={youtubeResults}
                        isSearching={isSearching}
                        moodColor={moodColor}
                        onSongPlay={handleSongPlay}
                        onNavHome={() => setView('home')}
                        onNavSearch={() => setView('search')}
                        onNavTimeline={() => setView('timeline')}
                        onPlaylist={() => setShowPlaylistManager(true)}
                        onSettings={() => setShowSettings(true)}
                        showPlaylistManager={showPlaylistManager}
                        showSettings={showSettings}
                        playlistCount={playlists.length}
                        currentSong={currentSong}
                        isPlaying={isPlaying}
                        progress={progress}
                        duration={duration}
                        onExpandPlayer={() => setView('playing')}
                        onPlayPause={() => setIsPlaying(!isPlaying)}
                        onPrev={handlePrev}
                        onNext={handleNext}
                        onClosePlayer={() => { setCurrentSong(null); setIsPlaying(false); }}
                    />
                )}
                {view === 'timeline' && (
                    <TimelinePageView
                        moodHistory={moodHistory}
                        moodColor={moodColor}
                        onNavHome={() => setView('home')}
                        onNavSearch={() => setView('search')}
                        onNavTimeline={() => setView('timeline')}
                        onPlaylist={() => setShowPlaylistManager(true)}
                        onSettings={() => setShowSettings(true)}
                        showPlaylistManager={showPlaylistManager}
                        showSettings={showSettings}
                        playlistCount={playlists.length}
                        currentSong={currentSong}
                        isPlaying={isPlaying}
                        progress={progress}
                        duration={duration}
                        onExpandPlayer={() => setView('playing')}
                        onPlayPause={() => setIsPlaying(!isPlaying)}
                        onPrev={handlePrev}
                        onNext={handleNext}
                        onClosePlayer={() => { setCurrentSong(null); setIsPlaying(false); }}
                    />
                )}
                {view === 'playing' && (
                    <PlayingView
                        currentSong={currentSong}
                        selectedMood={selectedMood}
                        moodColor={moodColor}
                        isPlaying={isPlaying}
                        isMuted={isMuted}
                        autoplayBlocked={autoplayBlocked}
                        isCinemaMode={isCinemaMode}
                        dataSaver={dataSaver}
                        progress={progress}
                        duration={duration}
                        selectedSubMood={selectedSubMood}
                        subMoodLoading={subMoodLoading}
                        activeNav={view}
                        onPlayPause={() => setIsPlaying(!isPlaying)}
                        onPrev={handlePrev}
                        onNext={handleNext}
                        onUnmute={() => setIsMuted(false)}
                        onStartPlayback={() => { setIsMuted(false); setAutoplayBlocked(false); setIsPlaying(true); }}
                        onToggleCinema={toggleCinemaMode}
                        onSubMoodSelect={handleSubMoodSelect}
                        onNavHome={() => setView('home')}
                        onNavSearch={() => setView('search')}
                        onNavTimeline={() => setView('timeline')}
                        onNavLanding={() => setView('landing')}
                        onGoToPlaylist={() => {
                            setShowPlaylistManager(true);
                            setView('home');
                        }}
                        onPlaylist={() => setShowPlaylistManager(true)}
                        onSettings={() => setShowSettings(true)}
                        showPlaylistManager={showPlaylistManager}
                        showSettings={showSettings}
                        playlistCount={playlists.length}
                    />
                )}
            </AnimatePresence>

            {/* Hidden Player */}
            <div className={`hidden-player ${!currentSong?.youtube_id || dataSaver ? 'hidden' : ''} ${isCinemaMode ? 'fixed inset-0 z-0' : 'fixed bottom-4 right-4 w-[280px] h-[158px] z-50 rounded-xl overflow-hidden shadow-2xl opacity-0 pointer-events-none'}`}>
                {currentSong?.youtube_id && (
                    <>
                        <YouTubePlayer
                            videoId={currentSong.youtube_id}
                            isPlaying={isPlaying}
                            muted={isMuted}
                            width="100%"
                            height="100%"
                            className="w-full h-full"
                            onStateChange={(state) => {
                                if (!currentSong?.audio_url) {
                                    if (state === 'ended') handleNext();
                                    else if (state === 'playing') { setIsPlaying(true); setAutoplayBlocked(false); }
                                    else if (state === 'paused') setIsPlaying(false);
                                }
                            }}
                            onProgress={(cur, dur) => {
                                if (!currentSong?.audio_url) {
                                    setProgress(cur);
                                    setDuration(dur);
                                }
                            }}
                            onReady={() => { }}
                            onAutoplayBlocked={() => {
                                setIsPlaying(false);
                                setAutoplayBlocked(true);
                            }}
                        />
                        {isCinemaMode && (
                            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-transparent pointer-events-none" />
                        )}
                    </>
                )}
            </div>

            <PlaylistManager
                isOpen={showPlaylistManager}
                onClose={() => setShowPlaylistManager(false)}
                playlists={playlists}
                onCreatePlaylist={handleCreatePlaylist}
                onDeletePlaylist={handleDeletePlaylist}
                onPlayPlaylist={handlePlayPlaylist}
                onRemoveSong={handleRemoveSongFromPlaylist}
            />

            <SettingsPanel
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                moodColor={moodColor}
                dataSaver={dataSaver}
                onDataSaver={setDataSaver}
                bgEffects={showBackgroundEffects}
                onBgEffects={setShowBackgroundEffects}
                autoPlay={autoPlayNext}
                onAutoPlay={setAutoPlayNext}
            />

            {playlistManager.isOpen && playlistManager.song && (
                <AddToPlaylistPopover
                    onClose={() => setPlaylistManager({ isOpen: false, song: null })}
                    song={playlistManager.song}
                    playlists={playlists}
                    onAddToPlaylist={handleAddToPlaylist}
                />
            )}
        </main>
    );
}
