'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser, useClerk, SignIn } from '@clerk/nextjs';
import toast from 'react-hot-toast';
import FaceCamera from '@/components/FaceCamera';
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

// ===== VIEWS =====
type AppView = 'landing' | 'home' | 'search' | 'playing' | 'camera' | 'media' | 'timeline';

export default function Home() {
    const { user, isSignedIn } = useUser();
    const { signOut, openSignIn } = useClerk();

    const [view, setView] = useState<AppView>('landing');
    const [selectedMood, setSelectedMood] = useState<MoodType | null>(null);
    const [songs, setSongs] = useState<RecommendedSong[]>([]);
    const [currentSong, setCurrentSong] = useState<RecommendedSong | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
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

    const [youtubeResults, setYoutubeResults] = useState<RecommendedSong[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [selectedSubMood, setSelectedSubMood] = useState<string | null>(null);
    const [subMoodLoading, setSubMoodLoading] = useState(false);

    // Clerk auth + user preferences
    const [showSignIn, setShowSignIn] = useState(false);
    const [likedSongs, setLikedSongs] = useState<Set<string>>(new Set());
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [showPlaylistManager, setShowPlaylistManager] = useState(false);
    const [addToPlaylistSong, setAddToPlaylistSong] = useState<RecommendedSong | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [dataSaver, setDataSaver] = useState(false);
    const [showBackgroundEffects, setShowBackgroundEffects] = useState(true);
    const [autoPlayNext, setAutoPlayNext] = useState(true);
    const userId = user?.id || 'anon';

    // Load liked songs, playlists, and settings from localStorage
    useEffect(() => {
        try {
            const liked = localStorage.getItem(`liked_songs_${userId}`);
            if (liked) setLikedSongs(new Set(JSON.parse(liked)));
            const pls = localStorage.getItem(`playlists_${userId}`);
            if (pls) setPlaylists(JSON.parse(pls));
            const settings = localStorage.getItem(`settings_${userId}`);
            if (settings) {
                const s = JSON.parse(settings);
                if (typeof s.dataSaver === 'boolean') setDataSaver(s.dataSaver);
                if (typeof s.showBackgroundEffects === 'boolean') setShowBackgroundEffects(s.showBackgroundEffects);
                if (typeof s.autoPlayNext === 'boolean') setAutoPlayNext(s.autoPlayNext);
            }
        } catch { }
    }, [userId]);

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

    // Persist liked songs
    const toggleLikeSong = useCallback((songId: string) => {
        setLikedSongs(prev => {
            const next = new Set(prev);
            const wasLiked = next.has(songId);
            if (wasLiked) next.delete(songId);
            else next.add(songId);
            localStorage.setItem(`liked_songs_${userId}`, JSON.stringify(Array.from(next)));
            toast(wasLiked ? 'Removed from liked' : 'Added to liked', {
                icon: wasLiked ? '💔' : '❤️',
            });
            return next;
        });
    }, [userId]);

    // Playlist handlers
    const handleCreatePlaylist = useCallback((name: string) => {
        const newPl: Playlist = { id: `pl-${Date.now()}`, name, songs: [], createdAt: new Date().toISOString() };
        setPlaylists(prev => {
            const next = [...prev, newPl];
            localStorage.setItem(`playlists_${userId}`, JSON.stringify(next));
            return next;
        });
    }, [userId]);

    const handleDeletePlaylist = useCallback((id: string) => {
        setPlaylists(prev => {
            const next = prev.filter(p => p.id !== id);
            localStorage.setItem(`playlists_${userId}`, JSON.stringify(next));
            return next;
        });
    }, [userId]);

    const handleAddToPlaylist = useCallback((playlistId: string, song: RecommendedSong) => {
        setPlaylists(prev => {
            const playlist = prev.find(p => p.id === playlistId);
            if (playlist && !playlist.songs.some(s => s.id === song.id)) {
                toast(`Added to "${playlist.name}"`, { icon: '🎶' });
            }
            const next = prev.map(p =>
                p.id === playlistId && !p.songs.some(s => s.id === song.id)
                    ? { ...p, songs: [...p.songs, song] }
                    : p
            );
            localStorage.setItem(`playlists_${userId}`, JSON.stringify(next));
            return next;
        });
    }, [userId]);

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
    }, [userId]);

    const handlePlayPlaylist = useCallback((playlist: Playlist) => {
        if (playlist.songs.length === 0) return;
        setSongs(playlist.songs);
        setCurrentSong(playlist.songs[0]);
        setIsPlaying(true);
        setView('playing');
        setShowPlaylistManager(false);
    }, []);

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

    useEffect(() => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

        if (!searchQuery.trim()) {
            setYoutubeResults([]);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        searchTimerRef.current = setTimeout(async () => {
            const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
            if (!apiKey) { setIsSearching(false); return; }

            try {
                const res = await fetch(
                    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=20&q=${encodeURIComponent(searchQuery)}&key=${apiKey}`
                );
                if (!res.ok) { setIsSearching(false); return; }
                const data = await res.json();
                const mapped: RecommendedSong[] = (data.items || []).map((item: any, i: number) => ({
                    id: `yt-${item.id.videoId}`,
                    title: (item.snippet.title || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
                    artist: item.snippet.channelTitle || '',
                    album: '',
                    genre: '',
                    mood_tag: '',
                    duration: 0,
                    cover_url: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || null,
                    audio_url: null,
                    preview_url: null,
                    youtube_id: item.id.videoId,
                    valence: 0.5,
                    energy: 0.5,
                    danceability: 0.5,
                    popularity: 50,
                    release_date: item.snippet.publishedAt || null,
                    score: 1 - i * 0.02,
                    mood_match: 0.5,
                    user_similarity: 0.5,
                }));
                setYoutubeResults(mapped);
            } catch {
                setYoutubeResults([]);
            }
            setIsSearching(false);
        }, 500);

        return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
    }, [searchQuery]);

    const handleRotateVideo = () => {
        setVideoRotation((prev) => (prev + 90) % 360);
    };

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
        setCameraActive(false);
        setIsDetecting(false);
        setDetectedEmotion(null);
        setDetectedConfidence(0);
        setArtistFilter('');
    };

    const handleMoodSelect = (mood: MoodType, source: 'camera' | 'manual' = 'manual', confidence: number = 1.0) => {
        setSelectedMood(mood);
        setSelectedSubMood(null);
        // Boost liked songs by sorting them higher
        const baseSongs = getSampleSongs(mood);
        const boosted = [...baseSongs].sort((a, b) => {
            const aLiked = likedSongs.has(a.id) ? 0.2 : 0;
            const bLiked = likedSongs.has(b.id) ? 0.2 : 0;
            return (b.score + bLiked) - (a.score + aLiked);
        });
        setSongs(boosted);
        const updated = addMoodEntry(mood, source, confidence);
        setMoodHistory(updated);
    };

    const handleCameraMood = (mood: MoodType, conf: number) => {
        setDetectedEmotion(MOOD_CONFIG[mood].label);
        setDetectedConfidence(Math.round(conf * 100));
        handleMoodSelect(mood, 'camera', conf);
        setIsDetecting(false);
        setCameraActive(false);

        // Auto-play a RANDOM song from the detected mood's playlist
        const availableSongs = getSampleSongs(mood);
        const filtered = artistFilter.trim()
            ? availableSongs.filter(s => s.artist.toLowerCase().includes(artistFilter.toLowerCase()))
            : availableSongs;

        if (filtered.length > 0) {
            const randomIndex = Math.floor(Math.random() * filtered.length);
            handleSongPlay(filtered[randomIndex]);
        }
    };

    const handleSongPlay = (song: RecommendedSong) => {
        setCurrentSong(song);
        setIsPlaying(true);
        setView('playing');
        setProgress(0);

        if (songs.length === 0 && selectedMood) {
            setSongs(getSampleSongs(selectedMood));
        }

        try {
            const log = JSON.parse(localStorage.getItem('songs_played_log') || '[]');
            log.push({ songTitle: song.title, artist: song.artist, timestamp: new Date().toISOString() });
            localStorage.setItem('songs_played_log', JSON.stringify(log));
        } catch { }
    };

    const handleSubMoodSelect = async (subMood: string) => {
        const mood = selectedMood || 'happy';
        setSelectedSubMood(subMood);
        setSubMoodLoading(true);

        const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
        if (!apiKey) { setSubMoodLoading(false); return; }

        try {
            const q = `${MOOD_CONFIG[mood].label} ${subMood} music`;
            const res = await fetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=15&q=${encodeURIComponent(q)}&key=${apiKey}`
            );
            if (!res.ok) { setSubMoodLoading(false); return; }
            const data = await res.json();
            const mapped: RecommendedSong[] = (data.items || []).map((item: any, i: number) => ({
                id: `yt-sub-${item.id.videoId}`,
                title: (item.snippet.title || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
                artist: item.snippet.channelTitle || '',
                album: '',
                genre: mood,
                mood_tag: mood,
                duration: 0,
                cover_url: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || null,
                audio_url: null,
                preview_url: null,
                youtube_id: item.id.videoId,
                valence: 0.5,
                energy: 0.5,
                danceability: 0.5,
                popularity: 50,
                release_date: item.snippet.publishedAt || null,
                score: 1 - i * 0.02,
                mood_match: 0.5,
                user_similarity: 0.5,
            }));

            if (mapped.length > 0) {
                setSongs(mapped);
                handleSongPlay(mapped[0]);
            }
        } catch { }
        setSubMoodLoading(false);
    };

    const handleNext = () => {
        if (!currentSong) return;
        const idx = songs.findIndex(s => s.id === currentSong.id);
        if (idx < songs.length - 1) handleSongPlay(songs[idx + 1]);
    };

    const handlePrev = () => {
        if (!currentSong) return;
        const idx = songs.findIndex(s => s.id === currentSong.id);
        if (idx > 0) handleSongPlay(songs[idx - 1]);
    };

    const moodColor = selectedMood ? MOOD_CONFIG[selectedMood].color : '#3b82f6';

    const renderMiniPlayer = () => {
        if (!currentSong || view === 'playing') return null;

        const progressPct = duration > 0 ? (progress / duration) * 100 : 0;

        return (
            <motion.div
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 50, opacity: 0 }}
                onClick={() => setView('playing')}
                className="mx-2 mb-1 rounded-xl bg-[#2a2a35]/95 border border-white/5 shadow-2xl cursor-pointer hover:bg-[#323240]/95 transition-colors overflow-hidden"
            >
                {/* Progress bar along the top */}
                <div className="h-[2px] w-full bg-white/[0.04]">
                    <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: moodColor, width: `${progressPct}%` }}
                        transition={{ duration: 0.3, ease: 'linear' }}
                    />
                </div>

                <div className="p-2 flex items-center justify-between">
                    {/* Left: Art & Info */}
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0 bg-black relative">
                            {currentSong.cover_url && <img src={currentSong.cover_url} alt="" className="w-full h-full object-cover" />}
                            {isPlaying && (
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                    <div className="flex gap-[2px] items-end h-3">
                                        {[0, 1, 2].map((i) => (
                                            <span
                                                key={i}
                                                className="w-[3px] rounded-full animate-pulse"
                                                style={{
                                                    backgroundColor: moodColor,
                                                    height: `${40 + i * 20}%`,
                                                    animationDelay: `${i * 0.15}s`,
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex-col min-w-0 pr-2">
                            <p className="text-xs font-bold text-white truncate text-ellipsis">{currentSong.title}</p>
                            <p className="text-[10px] text-white/50 truncate text-ellipsis">{currentSong.artist}</p>
                        </div>
                    </div>

                    {/* Right: Controls */}
                    <div className="flex items-center gap-1 flex-shrink-0 pr-1">
                        <button
                            onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                            className="p-1.5 text-white/60 hover:text-white transition-colors"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsPlaying(!isPlaying); }}
                            className="p-1.5 text-white hover:text-purple-400 transition-colors"
                        >
                            {isPlaying ? (
                                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
                            ) : (
                                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                            )}
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleNext(); }}
                            className="p-1.5 text-white/60 hover:text-white transition-colors"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setCurrentSong(null); setIsPlaying(false); }}
                            className="p-1.5 text-white/40 hover:text-red-400 transition-colors ml-1"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>
            </motion.div>
        );
    };

    return (
        <div className="relative min-h-screen w-full overflow-y-auto text-white" style={{ background: view === 'landing' ? '#1a1025' : '#0a0a0f' }}>
            {/* Background elements (Dynamic Mood Background) */}
            <div className="absolute inset-0 z-0 pointer-events-none transition-colors duration-1000" style={{ backgroundColor: view === 'playing' ? `${moodColor}30` : 'transparent' }}>
                <div
                    className="absolute inset-0 opacity-20"
                    style={{
                        backgroundImage: `radial-gradient(circle at 50% 0%, ${moodColor} 0%, transparent 70%)`
                    }}
                />
                <div
                    className="absolute inset-0"
                    style={{
                        background: `radial-gradient(ellipse at 50% 100%, ${moodColor}15 0%, transparent 60%)`,
                    }}
                />
            </div>

            {/* Star drop animation for non-landing views */}
            {view !== 'landing' && showBackgroundEffects && <StarDropBackground />}

            {/* Global Persistent YouTube Player Layer (Always Mounted for Audio, Visible Only in 'playing' view) */}
            <div className={`absolute inset-0 z-0 overflow-hidden transition-all duration-1000 ${view === 'playing' && !dataSaver ? (isCinemaMode ? 'opacity-100 z-40' : 'opacity-60') : 'opacity-0 pointer-events-none'}`}>
                {/* Full Screen Video Container */}
                <div
                    className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto transition-all duration-1000 ${isCinemaMode ? 'w-full h-[100vw] sm:h-full max-w-none bg-black' : 'w-[300vh] h-[300vh] max-w-none max-h-none'}`}
                    style={{ transform: `translate(-50%, -50%) rotate(${videoRotation}deg)` }}
                >
                    {currentSong?.audio_url && !currentSong?.youtube_id && (
                        <audio
                            ref={audioRef}
                            src={currentSong.audio_url}
                            loop={false}
                            className="hidden"
                            onTimeUpdate={(e) => {
                                const audio = e.currentTarget;
                                setProgress(Math.floor(audio.currentTime));
                                if (audio.duration) setDuration(Math.floor(audio.duration));
                            }}
                            onEnded={() => handleNext()}
                        />
                    )}

                    {currentSong?.youtube_id && (
                        <YouTubePlayer
                            videoId={currentSong.youtube_id}
                            isPlaying={isPlaying}
                            width="100%"
                            height="100%"
                            className={`w-full h-full transition-opacity duration-300 ${isPlaying && !dataSaver ? 'opacity-100' : 'opacity-0'} ${isCinemaMode ? 'pointer-events-auto' : 'pointer-events-none'}`}
                            onStateChange={(state) => {
                                // Don't let youtube end events loop if native audio is driving
                                if (!currentSong?.audio_url) {
                                    if (state === 'ended') handleNext();
                                    else if (state === 'playing') setIsPlaying(true);
                                    else if (state === 'paused') setIsPlaying(false);
                                }
                            }}
                            onProgress={(cur, dur) => {
                                // Only track youtube progress if native audio isn't 
                                if (!currentSong?.audio_url) {
                                    setProgress(Math.floor(cur));
                                    setDuration(Math.floor(dur));
                                }
                            }}
                            onReady={() => { }}
                        />
                    )}
                    {(!isPlaying || !currentSong?.youtube_id) && currentSong?.cover_url && (
                        <img src={currentSong.cover_url} alt="" className="w-full h-full object-cover blur-xl transition-opacity duration-500" />
                    )}
                </div>

                {/* Overlay Gradients to darken background video and make UI readable */}
                <div className={`absolute inset-0 bg-black/40 pointer-events-none transition-opacity duration-700 ${isCinemaMode ? 'opacity-0' : 'opacity-100'}`} />
                <div className={`absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-black/80 pointer-events-none transition-opacity duration-700 ${isCinemaMode ? 'opacity-0' : 'opacity-100'}`} />
                <div className={`absolute inset-0 bg-gradient-to-b from-[#0a0a0f] via-transparent to-transparent opacity-80 pointer-events-none transition-opacity duration-700 ${isCinemaMode ? 'opacity-0' : 'opacity-100'}`} />
            </div>

            {/* Cinema Mode Tap-to-Exit Overlay */}
            {isCinemaMode && view === 'playing' && (
                <div
                    className="absolute inset-0 z-50 cursor-pointer"
                    onClick={toggleCinemaMode}
                />
            )}

            <AnimatePresence mode="wait">
                {view === 'landing' && (
                    <motion.div
                        key="landing"
                        className="relative z-10 flex flex-col items-center min-h-screen overflow-x-hidden"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 0.97, filter: 'blur(8px)' }}
                        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                    >
                        <ShaderBackground />

                        {/* Ambient glow orbs behind hero */}
                        <div className="hero-ambient w-[500px] h-[500px] sm:w-[700px] sm:h-[700px] -top-40 left-1/2 -translate-x-1/2 z-0 fixed" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)' }} />
                        <div className="hero-ambient w-[300px] h-[300px] sm:w-[400px] sm:h-[400px] top-1/2 -right-20 z-0 fixed" style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)' }} />

                        {/* ===== HERO SECTION ===== */}
                        <section className="relative z-10 flex flex-col items-center justify-center min-h-screen w-full px-4 sm:px-8 lg:px-16">

                            {/* Decorative rings */}
                            <motion.div
                                className="landing-ring w-[320px] h-[320px] sm:w-[480px] sm:h-[480px] lg:w-[560px] lg:h-[560px] absolute"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.2, duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
                            />
                            <motion.div
                                className="landing-ring w-[400px] h-[400px] sm:w-[600px] sm:h-[600px] lg:w-[700px] lg:h-[700px] absolute"
                                style={{ borderColor: 'rgba(6,182,212,0.04)' }}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.35, duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
                            />

                            {/* Glassmorphism Hero Card */}
                            <motion.div
                                className="glass-hero rounded-3xl p-6 sm:p-10 md:p-14 lg:p-16 max-w-md sm:max-w-lg lg:max-w-xl w-full mx-auto text-center relative overflow-hidden"
                                initial={{ opacity: 0, y: 30, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ delay: 0.15, duration: 1, ease: [0.16, 1, 0.3, 1] }}
                            >
                                {/* Subtle top highlight */}
                                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

                                {/* Tagline chip */}
                                <motion.div
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-5 sm:mb-6"
                                    style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.12)' }}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400/60" />
                                    <span className="text-[10px] sm:text-[11px] tracking-[0.2em] uppercase text-purple-300/70 font-semibold">AI-Powered Music</span>
                                </motion.div>

                                {/* Hero Title */}
                                <motion.h1
                                    className="text-4xl sm:text-5xl md:text-6xl font-display font-black tracking-tight mb-3 sm:mb-4 hero-gradient-text leading-[1.1]"
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                                >
                                    MoodBeats
                                </motion.h1>

                                {/* Subtitle */}
                                <motion.p
                                    className="text-white/30 text-xs sm:text-sm md:text-base font-medium max-w-sm mx-auto mb-5 sm:mb-6 leading-relaxed"
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.45, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                                >
                                    Music that adapts to how you feel.<br className="hidden sm:block" />
                                    Detect your mood, discover your soundtrack.
                                </motion.p>

                                {/* Integration badges */}
                                <motion.div
                                    className="flex items-center justify-center gap-2.5 sm:gap-3 mb-7 sm:mb-9 flex-wrap"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.52, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                                >
                                    {/* AI Face Detect */}
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.18)' }}>
                                        <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                        <span className="text-[10px] sm:text-[11px] font-bold tracking-wide uppercase text-purple-300/80">AI Face Detect</span>
                                    </div>

                                    {/* Spotify */}
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(30,215,96,0.08)', border: '1px solid rgba(30,215,96,0.15)' }}>
                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="#1DB954">
                                            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381C8.64 5.801 15.6 6.06 20.04 8.82c.54.3.72 1.02.42 1.56-.3.42-1.02.6-1.56.3h.18z" />
                                        </svg>
                                        <span className="text-[10px] sm:text-[11px] font-bold tracking-wide uppercase text-[#1DB954]/80">Spotify</span>
                                    </div>

                                    {/* YouTube */}
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,0,0,0.08)', border: '1px solid rgba(255,0,0,0.15)' }}>
                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="#FF0000">
                                            <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                                        </svg>
                                        <span className="text-[10px] sm:text-[11px] font-bold tracking-wide uppercase text-red-400/80">YouTube</span>
                                    </div>
                                </motion.div>

                                {/* CTA Button */}
                                <motion.button
                                    whileHover={{ scale: 1.03, boxShadow: '0 0 40px rgba(147,51,234,0.25)' }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => {
                                        const hitSound = new Audio('https://s3.amazonaws.com/freecodecamp/drums/Kick_n_Hat.mp3');
                                        hitSound.volume = 0.5;
                                        hitSound.play().catch(() => { });
                                        resetHomeState(); setView('home');
                                    }}
                                    className="w-full max-w-[220px] sm:max-w-[260px] text-white font-semibold py-3 sm:py-3.5 rounded-xl text-sm sm:text-base tracking-wide transition-all duration-300 relative overflow-hidden group"
                                    style={{
                                        background: 'linear-gradient(135deg, #9333ea 0%, #6366f1 50%, #8b5cf6 100%)',
                                        boxShadow: '0 0 20px rgba(147,51,234,0.15)',
                                    }}
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.6, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                                >
                                    <span className="relative z-10">Get Started</span>
                                    <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                </motion.button>

                                {/* Continue as Guest */}
                                <motion.button
                                    onClick={() => { resetHomeState(); setView('home'); }}
                                    className="mt-4 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all hover:bg-white/[0.06]"
                                    style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.8, duration: 0.6 }}
                                    whileHover={{ scale: 1.04 }}
                                    whileTap={{ scale: 0.96 }}
                                >
                                    <svg className="w-3 h-3 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    <span className="text-[10px] sm:text-[11px] font-semibold tracking-[0.15em] uppercase text-white/35">Guest Mode</span>
                                </motion.button>

                                {/* Bottom highlight */}
                                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500/[0.06] to-transparent" />
                            </motion.div>

                            {/* Scroll indicator */}
                            <motion.div
                                className="absolute bottom-6 sm:bottom-10 flex flex-col items-center gap-2"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 1.2, duration: 1 }}
                            >
                                <span className="text-[9px] tracking-[0.3em] uppercase text-white/20 font-medium">Scroll to explore</span>
                                <svg className="w-4 h-4 text-white/25 scroll-indicator" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                </svg>
                            </motion.div>
                        </section>

                        {/* ===== FEATURE CARDS — 3D Scroll Reveal ===== */}
                        <section className="relative z-10 w-full px-4 sm:px-8 lg:px-16 xl:px-24 pb-20 sm:pb-28 -mt-4">
                            <div className="perspective-container max-w-5xl mx-auto">
                                <motion.div
                                    className="flex items-center justify-center gap-3 mb-10 sm:mb-14"
                                    initial={{ opacity: 0 }}
                                    whileInView={{ opacity: 1 }}
                                    viewport={{ once: true, margin: '-50px' }}
                                    transition={{ duration: 0.8 }}
                                >
                                    <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-transparent to-white/10" />
                                    <p className="text-[10px] sm:text-xs tracking-[0.4em] uppercase text-white/25 font-semibold">
                                        Why MoodBeats
                                    </p>
                                    <div className="h-px flex-1 max-w-[60px] bg-gradient-to-l from-transparent to-white/10" />
                                </motion.div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                                    {[
                                        {
                                            icon: '🎭',
                                            title: 'Smart Detection',
                                            desc: 'AI reads your facial expression in real-time and matches your mood to music instantly',
                                            accent: '#a855f7',
                                            floatClass: 'gentle-float',
                                        },
                                        {
                                            icon: '🎵',
                                            title: 'Smart Playlists',
                                            desc: 'Curated tracks for every emotional state — from euphoria to deep focus and beyond',
                                            accent: '#ec4899',
                                            floatClass: 'gentle-float-delay-1',
                                        },
                                        {
                                            icon: '📊',
                                            title: 'Mood Timeline',
                                            desc: 'Track your emotional journey over the last 24 hours with rich visual insights',
                                            accent: '#06b6d4',
                                            floatClass: 'gentle-float-delay-2',
                                        },
                                        {
                                            icon: '🔍',
                                            title: 'Global Search',
                                            desc: 'Search across all moods to find any artist or track in our curated library',
                                            accent: '#f59e0b',
                                            floatClass: 'gentle-float-delay-3',
                                        },
                                        {
                                            icon: '🎬',
                                            title: 'Cinema Mode',
                                            desc: 'Full-screen immersive video playback with ambient mood lighting effects',
                                            accent: '#ef4444',
                                            floatClass: 'gentle-float-delay-4',
                                        },
                                        {
                                            icon: '🧠',
                                            title: 'Neural Sync',
                                            desc: 'Adaptive engine learns your taste and refines recommendations over time',
                                            accent: '#10b981',
                                            floatClass: 'gentle-float-delay-5',
                                        },
                                    ].map((feat, i) => (
                                        <motion.div
                                            key={feat.title}
                                            className={`glass-feature rounded-2xl p-5 sm:p-6 text-center sm:text-left cursor-default group relative overflow-hidden ${feat.floatClass}`}
                                            initial={{ opacity: 0, y: 40, scale: 0.95 }}
                                            whileInView={{ opacity: 1, y: 0, scale: 1 }}
                                            viewport={{ once: true, margin: '-30px' }}
                                            transition={{
                                                delay: i * 0.1,
                                                duration: 0.7,
                                                ease: [0.16, 1, 0.3, 1],
                                            }}
                                            whileHover={{ y: -6, scale: 1.03 }}
                                        >
                                            {/* Top highlight */}
                                            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
                                            {/* Card accent glow */}
                                            <div
                                                className="absolute -top-16 -right-16 w-40 h-40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700"
                                                style={{ background: `radial-gradient(circle, ${feat.accent}18 0%, transparent 70%)` }}
                                            />
                                            <div
                                                className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center text-2xl sm:text-3xl mb-3 sm:mb-4 mx-auto sm:mx-0 group-hover:scale-110 transition-transform duration-300 relative z-10 feature-icon-glow"
                                                style={{
                                                    background: `${feat.accent}15`,
                                                    border: `1px solid ${feat.accent}25`,
                                                    ['--glow-color' as any]: `${feat.accent}20`,
                                                }}
                                            >
                                                {feat.icon}
                                            </div>
                                            <h3 className="text-sm sm:text-base font-bold text-white/90 mb-1.5 relative z-10">{feat.title}</h3>
                                            <p className="text-[11px] sm:text-xs text-white/35 leading-relaxed relative z-10">{feat.desc}</p>
                                            {/* Bottom accent bar */}
                                            <div
                                                className="mt-4 h-[2px] w-8 rounded-full mx-auto sm:mx-0 opacity-40 group-hover:opacity-80 group-hover:w-14 transition-all duration-500"
                                                style={{ backgroundColor: feat.accent }}
                                            />
                                            {/* Bottom highlight */}
                                            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.03] to-transparent" />
                                        </motion.div>
                                    ))}
                                </div>

                                {/* Bottom CTA */}
                                <motion.div
                                    className="text-center mt-12 sm:mt-16"
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                                >
                                    <button
                                        onClick={() => { resetHomeState(); setView('home'); }}
                                        className="px-8 py-3 rounded-full text-[11px] sm:text-xs tracking-[0.2em] uppercase font-bold text-white/50 hover:text-white/80 transition-all duration-300"
                                        style={{ border: '1px solid rgba(255,255,255,0.06)' }}
                                    >
                                        Start Listening
                                    </button>
                                </motion.div>
                            </div>
                        </section>
                    </motion.div>
                )}

                {view === 'home' && (
                    /* ==================== HOME VIEW ==================== */
                    <motion.div
                        key="home"
                        className="relative z-10 flex flex-col min-h-screen pb-28 justify-start"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, x: -50 }}
                    >
                        {/* Top bar */}
                        <div className="flex items-center justify-between px-5 pt-4 pb-2">
                            {songs.length > 0 ? (
                                <button onClick={() => resetHomeState()} className="p-1">
                                    <svg className="w-6 h-6 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                                    </svg>
                                </button>
                            ) : (
                                <div className="w-7 h-7" />
                            )}
                            <div className="text-center">
                                <h1 className="text-xs tracking-[0.3em] uppercase font-bold text-white/80">
                                    {songs.length > 0 ? `${MOOD_CONFIG[selectedMood!]?.label} Playlist` : 'MoodBeats'}
                                </h1>
                                <div className="w-5 h-0.5 rounded-full mx-auto mt-1" style={{ backgroundColor: moodColor }} />
                            </div>
                            <UserMenu
                                isSignedIn={!!isSignedIn}
                                userName={user?.firstName || user?.username || null}
                                userImage={user?.imageUrl || null}
                                onSignIn={() => setShowSignIn(true)}
                                onSignOut={() => signOut()}
                            />
                        </div>

                        {/* Start Detection / Camera Section */}
                        <div className="px-5 sm:px-8 lg:px-12 xl:px-20 mt-2">
                            {/* Camera area */}
                            <AnimatePresence>
                                {cameraActive ? (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <FaceCamera
                                            onMoodDetected={handleCameraMood}
                                            isActive={cameraActive}
                                            isDetecting={isDetecting}
                                            onStartDetect={() => setIsDetecting(true)}
                                            onStopDetect={() => setIsDetecting(false)}
                                        />
                                        {/* Stop Detection Button */}
                                        <div className="mt-2 mb-2">
                                            <button
                                                onClick={() => { setCameraActive(false); setIsDetecting(false); }}
                                                className="w-full py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600/30 transition-all"
                                            >
                                                ⬛ Stop & Close Camera
                                            </button>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="text-center py-6 sm:py-8"
                                    >
                                        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-display font-black tracking-tight">
                                            {selectedMood ? (
                                                <>Current Mood Detected</>
                                            ) : (
                                                <>Select Your Mood</>
                                            )}
                                        </h2>

                                        {selectedMood && (
                                            <motion.div
                                                initial={{ scale: 0.8, opacity: 0 }}
                                                animate={{ scale: 1, opacity: 1 }}
                                                className="mt-4"
                                            >
                                                <div className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center text-4xl"
                                                    style={{ background: `${moodColor}15`, border: `1px solid ${moodColor}30` }}>
                                                    {MOOD_CONFIG[selectedMood].emoji}
                                                </div>
                                                <p className="font-display text-2xl font-black uppercase tracking-wider mt-3 italic"
                                                    style={{ color: moodColor }}>
                                                    {MOOD_CONFIG[selectedMood].label}
                                                </p>
                                                {detectedConfidence > 0 && (
                                                    <p className="text-[10px] tracking-[0.3em] uppercase text-white/30 mt-1">
                                                        (•) {detectedConfidence}% confidence
                                                    </p>
                                                )}
                                            </motion.div>
                                        )}

                                        {/* START DETECTION Button - only show when no playlist is active */}
                                        {songs.length === 0 && (
                                            <motion.button
                                                onClick={() => { setCameraActive(true); setIsDetecting(false); }}
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.95 }}
                                                className="mt-6 w-full max-w-[300px] mx-auto py-4 rounded-xl text-sm font-black tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-3"
                                                style={{
                                                    background: `linear-gradient(135deg, ${moodColor} 0%, ${moodColor}CC 100%)`,
                                                    color: '#000',
                                                    boxShadow: `0 0 30px ${moodColor}40`,
                                                }}
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                </svg>
                                                Start Detection
                                            </motion.button>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Mood Selector Pills */}
                        <div className="px-5 sm:px-8 lg:px-12 xl:px-20 mt-4">
                            <p className="text-[9px] tracking-[0.35em] uppercase text-center text-white/20 mb-3">
                                Select Disposition
                            </p>
                            <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
                                {(['happy', 'sad', 'gym', 'study', 'rock'] as MoodType[]).map((mood) => (
                                    <motion.button
                                        key={mood}
                                        onClick={() => handleMoodSelect(mood)}
                                        whileTap={{ scale: 0.95 }}
                                        className={`px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-[10px] sm:text-xs tracking-[0.2em] uppercase font-bold transition-all duration-300 ${selectedMood === mood
                                            ? 'bg-white/10 border border-white/30 text-white'
                                            : 'border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20'
                                            }`}
                                    >
                                        {MOOD_CONFIG[mood].emoji} {MOOD_CONFIG[mood].label}
                                    </motion.button>
                                ))}
                            </div>
                        </div>


                        {/* Optional Artist Filter */}
                        <div className="px-5 sm:px-8 lg:px-12 xl:px-20 mt-4">
                            <div className="relative max-w-2xl mx-auto">
                                <input
                                    type="text"
                                    placeholder="Optional: Filter by Artist..."
                                    value={artistFilter}
                                    onChange={(e) => setArtistFilter(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30 focus:bg-white/10 transition-all font-display tracking-widest uppercase text-center"
                                />
                                {artistFilter && (
                                    <button onClick={() => setArtistFilter('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/30 hover:text-white/70">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Mood Card Grid — fills empty space when no songs are loaded */}
                        {songs.length === 0 && (
                            <div className="px-5 sm:px-8 lg:px-12 xl:px-20 mt-8 flex-1">
                                <p className="text-[9px] tracking-[0.35em] uppercase text-center text-white/20 mb-5 font-semibold">
                                    Explore Moods
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 max-w-5xl mx-auto">
                                    {(['happy', 'sad', 'gym', 'study', 'rock'] as MoodType[]).map((mood, i) => (
                                        <motion.button
                                            key={mood}
                                            onClick={() => handleMoodSelect(mood)}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.08, duration: 0.5 }}
                                            whileHover={{ y: -4, scale: 1.03 }}
                                            whileTap={{ scale: 0.97 }}
                                            className={`glass-card rounded-2xl p-5 sm:p-6 text-center group cursor-pointer transition-all duration-300 ${selectedMood === mood ? 'ring-1' : ''
                                                }`}
                                            style={selectedMood === mood ? {
                                                borderColor: MOOD_CONFIG[mood].color + '60',
                                                boxShadow: `0 0 30px ${MOOD_CONFIG[mood].color}20`,
                                            } as any : {}}
                                        >
                                            <div
                                                className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl flex items-center justify-center text-3xl sm:text-4xl mb-3 mx-auto group-hover:scale-110 transition-transform duration-300"
                                                style={{
                                                    background: `${MOOD_CONFIG[mood].color}12`,
                                                    border: `1px solid ${MOOD_CONFIG[mood].color}20`,
                                                }}
                                            >
                                                {MOOD_CONFIG[mood].emoji}
                                            </div>
                                            <h3 className="text-sm sm:text-base font-bold text-white/80 mb-1 tracking-wider uppercase">
                                                {MOOD_CONFIG[mood].label}
                                            </h3>
                                            <p className="text-[10px] sm:text-xs text-white/30 leading-relaxed">
                                                {MOOD_CONFIG[mood].description}
                                            </p>
                                            {/* Accent line */}
                                            <div
                                                className="w-8 h-0.5 rounded-full mx-auto mt-3 opacity-40 group-hover:opacity-80 group-hover:w-12 transition-all duration-300"
                                                style={{ backgroundColor: MOOD_CONFIG[mood].color }}
                                            />
                                        </motion.button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Song List */}
                        {songs.length > 0 && (
                            <div className="px-5 sm:px-8 lg:px-12 xl:px-20 mt-6 flex-1 overflow-y-auto pb-24">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-[10px] tracking-[0.3em] uppercase text-white/30 font-semibold">
                                        Most Wanted Tracks
                                    </h3>
                                    <span className="text-[9px] tracking-[0.2em] uppercase font-bold px-2 py-0.5 rounded border"
                                        style={{ color: moodColor, borderColor: moodColor + '40' }}>
                                        Neural Sync
                                    </span>
                                </div>

                                <motion.div
                                    className="space-y-1.5 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:grid-cols-3"
                                    initial="hidden"
                                    animate="show"
                                    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
                                >
                                    {songs
                                        .filter(song => !artistFilter.trim() || song.artist.toLowerCase().includes(artistFilter.toLowerCase()))
                                        .map((song, i) => (
                                            <SongCard
                                                key={song.id}
                                                song={song}
                                                index={i}
                                                mood={selectedMood!}
                                                isActive={currentSong?.id === song.id}
                                                isPlaying={isPlaying && currentSong?.id === song.id}
                                                onPlay={() => handleSongPlay(song)}
                                                onLike={() => toggleLikeSong(song.id)}
                                                isLiked={likedSongs.has(song.id)}
                                                onAddToPlaylist={() => setAddToPlaylistSong(song)}
                                            />
                                        ))}
                                </motion.div>
                            </div>
                        )}

                        {/* Bottom Nav */}
                        <div className="fixed bottom-0 left-0 right-0 z-40 flex flex-col">
                            {renderMiniPlayer()}
                            <BottomNav active={activeNav} onNav={(nav) => {
                                setActiveNav(nav);
                                if (nav === 'search') setView('search');
                                if (nav === 'home') { resetHomeState(); setView('home'); };
                                if (nav === 'timeline') setView('timeline');
                            }} moodColor={moodColor} onPlaylist={() => setShowPlaylistManager(true)} onSettings={() => setShowSettings(true)} playlistOpen={showPlaylistManager} settingsOpen={showSettings} playlistCount={playlists.length} />
                        </div>
                    </motion.div>
                )}

                {view === 'search' && (
                    /* ==================== SEARCH VIEW (YouTube) ==================== */
                    <motion.div
                        key="search"
                        className="relative z-10 flex flex-col min-h-screen pb-28 w-full"
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                    >
                        <div className="flex items-center justify-between px-5 pt-4 pb-2">
                            <button onClick={() => { resetHomeState(); setView('home'); setActiveNav('home'); }} className="p-1">
                                <svg className="w-6 h-6 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <h1 className="text-xs tracking-[0.3em] uppercase font-bold text-white/80">Search YouTube</h1>
                            <div className="w-6" />
                        </div>

                        <div className="px-5 sm:px-8 lg:px-12 xl:px-20 mt-4 flex-1 flex flex-col">
                            <div className="relative">
                                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Search any song, artist, or music video..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-4 text-sm text-white placeholder-white/40 focus:outline-none focus:border-purple-500 focus:bg-white/10 transition-all font-display tracking-wide"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => { setSearchQuery(''); setYoutubeResults([]); }}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                )}
                            </div>

                            <div className="mt-6 space-y-1 overflow-y-auto pb-24 flex-1">
                                {!searchQuery.trim() && (
                                    <div className="flex flex-col items-center justify-center py-20 text-center">
                                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                                            <svg className="w-8 h-8 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                        </div>
                                        <p className="text-sm text-white/30 font-medium">Search YouTube for any music video</p>
                                        <p className="text-xs text-white/15 mt-1">Type a song, artist, or keyword to get started</p>
                                    </div>
                                )}

                                {isSearching && searchQuery.trim() && (
                                    <div className="space-y-2 py-4">
                                        {[1, 2, 3, 4, 5].map((i) => (
                                            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03]">
                                                <div className="w-12 h-12 rounded-lg bg-white/5 shimmer flex-shrink-0" />
                                                <div className="flex-1 space-y-2">
                                                    <div className="h-3 w-3/4 rounded bg-white/5 shimmer" />
                                                    <div className="h-2.5 w-1/2 rounded bg-white/5 shimmer" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {!isSearching && searchQuery.trim() && youtubeResults.length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-16 text-center">
                                        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: `${moodColor || '#8b5cf6'}12` }}>
                                            <svg className="w-7 h-7" style={{ color: `${moodColor || '#8b5cf6'}60` }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                        </div>
                                        <p className="text-sm text-white/40 font-medium">No results for &quot;{searchQuery}&quot;</p>
                                        <p className="text-xs text-white/20 mt-1.5 max-w-[240px]">Try searching for a different song, artist, or genre</p>
                                    </div>
                                )}

                                {youtubeResults.map((song) => (
                                    <motion.button
                                        key={song.id}
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        onClick={() => handleSongPlay(song)}
                                        className="w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left group hover:bg-white/[0.05]"
                                    >
                                        <div className="w-14 h-10 rounded-lg bg-white/10 overflow-hidden relative flex-shrink-0">
                                            <img src={song.cover_url || ''} className="w-full h-full object-cover" alt="" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                <svg className="w-5 h-5" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold truncate text-white">{song.title}</p>
                                            <p className="text-xs text-white/40 truncate">{song.artist}</p>
                                        </div>
                                        <div className="flex-shrink-0 w-5 h-5 text-red-500/60">
                                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.543 6.498C22 8.28 22 12 22 12s0 3.72-.457 5.502c-.254.985-.997 1.76-1.938 2.022C17.896 20 12 20 12 20s-5.893 0-7.605-.476c-.945-.266-1.687-1.04-1.938-2.022C2 15.72 2 12 2 12s0-3.72.457-5.502c.254-.985.997-1.76 1.938-2.022C6.107 4 12 4 12 4s5.896 0 7.605.476c.945.266 1.687 1.04 1.938 2.022zM10 15.5l6-3.5-6-3.5v7z" /></svg>
                                        </div>
                                    </motion.button>
                                ))}
                            </div>
                        </div>

                        <div className="fixed bottom-0 left-0 right-0 z-40 flex flex-col">
                            {renderMiniPlayer()}
                            <BottomNav active="search" onNav={(nav) => {
                                setActiveNav(nav);
                                if (nav === 'home') { resetHomeState(); setView('home'); };
                                if (nav === 'search') setView('search');
                                if (nav === 'timeline') setView('timeline');
                            }} moodColor={moodColor || '#8b5cf6'} onPlaylist={() => setShowPlaylistManager(true)} onSettings={() => setShowSettings(true)} playlistOpen={showPlaylistManager} settingsOpen={showSettings} playlistCount={playlists.length} />
                        </div>
                    </motion.div>
                )}

                {view === 'timeline' && (
                    /* ==================== MOOD TIMELINE VIEW ==================== */
                    <motion.div
                        key="timeline"
                        className="relative z-10 flex flex-col min-h-screen pb-28 w-full"
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                    >
                        <div className="flex items-center justify-between px-5 pt-4 pb-2">
                            <button onClick={() => { resetHomeState(); setView('home'); setActiveNav('home'); }} className="p-1">
                                <svg className="w-6 h-6 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <h1 className="text-xs tracking-[0.3em] uppercase font-bold text-white/80">Mood Timeline</h1>
                            <div className="w-6" />
                        </div>

                        <TimelineView moodHistory={moodHistory} moodColor={moodColor} />

                        <div className="fixed bottom-0 left-0 right-0 z-40 flex flex-col">
                            {renderMiniPlayer()}
                            <BottomNav active="timeline" onNav={(nav) => {
                                setActiveNav(nav);
                                if (nav === 'home') { resetHomeState(); setView('home'); };
                                if (nav === 'search') setView('search');
                                if (nav === 'timeline') setView('timeline');
                            }} moodColor={moodColor || '#8b5cf6'} onPlaylist={() => setShowPlaylistManager(true)} onSettings={() => setShowSettings(true)} playlistOpen={showPlaylistManager} settingsOpen={showSettings} playlistCount={playlists.length} />
                        </div>
                    </motion.div>
                )}

                {view === 'playing' && (
                    /* ==================== NOW PLAYING VIEW ==================== */
                    <motion.div
                        key="playing"
                        className={`relative z-10 flex flex-col h-screen overflow-hidden pb-24 transition-opacity duration-700 ${isCinemaMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 50 }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 pt-4 pb-2">
                            <button onClick={() => { resetHomeState(); setView('home'); }} className="p-1 relative z-30 pointer-events-auto">
                                <svg className="w-6 h-6 text-white/90 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>
                            <div className="text-center relative z-30 pointer-events-auto">
                                <p className="text-[9px] tracking-[0.3em] uppercase text-white/70 drop-shadow-md font-bold">
                                    MoodBeats // Media
                                </p>
                                <p className="text-xs font-black tracking-widest uppercase drop-shadow-lg text-white">Now Playing</p>
                            </div>
                            <button onClick={toggleCinemaMode} className="p-1 relative z-30 pointer-events-auto group">
                                <svg className="w-5 h-5 text-white/80 drop-shadow-md group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                </svg>
                            </button>
                        </div>



                        {/* Album Art / Video Placeholder */}
                        <div className={`flex-1 flex items-center justify-center px-8 py-2 ${currentSong?.youtube_id && !dataSaver ? 'opacity-0' : ''}`}>
                            {currentSong?.cover_url && dataSaver && (
                                <div className="w-full aspect-square max-w-[220px] sm:max-w-[280px] rounded-2xl overflow-hidden shadow-2xl">
                                    <img src={currentSong.cover_url} alt="" className="w-full h-full object-cover" />
                                </div>
                            )}
                            {!currentSong?.cover_url && <div className="w-full aspect-square max-w-[220px] sm:max-w-[280px]" />}
                        </div>

                        {/* Song Info */}
                        {currentSong && (
                            <div className="px-6 flex flex-col items-center relative z-20">
                                <motion.h2 key={currentSong.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                    className="font-display text-lg sm:text-2xl font-black tracking-tight uppercase text-center drop-shadow-lg relative z-20 line-clamp-1">
                                    {currentSong.title}
                                </motion.h2>
                                <p className="text-center text-white/80 text-[11px] sm:text-xs tracking-[0.2em] uppercase mt-0.5 drop-shadow-md relative z-20 font-semibold line-clamp-1">
                                    {currentSong.artist}{currentSong.album ? ` // ${currentSong.album}` : ''}
                                </p>
                            </div>
                        )}

                        {/* Progress Bar */}
                        <div className="px-6 mt-3">
                            <div className="relative h-[3px] bg-white/10 rounded-full overflow-hidden">
                                <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
                                    style={{
                                        width: `${duration > 0 ? (progress / duration) * 100 : 0}%`,
                                        backgroundColor: moodColor,
                                    }}
                                />
                            </div>
                            <div className="flex justify-between mt-1">
                                <span className="text-[10px] font-mono" style={{ color: moodColor + '90' }}>
                                    {formatDuration(progress)}
                                </span>
                                <span className="text-[10px] text-white/20 font-mono">
                                    {formatDuration(duration || currentSong?.duration || 0)}
                                </span>
                            </div>
                        </div>

                        {/* Playback Controls */}
                        <div className="flex items-center justify-center gap-6 sm:gap-8 mt-3">
                            <button className="p-2 text-white/30 hover:text-white/60 transition-colors active:scale-90">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                        d="M4 4h7l4 8-4 8H4M17 4h3M17 20h3M20 4l-3 3m3-3l-3-3M20 20l-3-3m3 3l-3 3" />
                                </svg>
                            </button>
                            <button onClick={handlePrev} className="p-2 text-white/60 hover:text-white transition-colors active:scale-90">
                                <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                                </svg>
                            </button>
                            <motion.button
                                onClick={() => setIsPlaying(!isPlaying)}
                                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center relative overflow-hidden group"
                                style={{
                                    background: moodColor,
                                    boxShadow: `0 0 40px ${moodColor}50, inset 0 -4px 10px rgba(0,0,0,0.3)`,
                                }}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.92 }}
                            >
                                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                {isPlaying ? (
                                    <svg className="w-7 h-7 sm:w-8 sm:h-8 text-white drop-shadow-md" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                                    </svg>
                                ) : (
                                    <svg className="w-7 h-7 sm:w-8 sm:h-8 text-white ml-1.5 sm:ml-2 drop-shadow-md" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                )}
                            </motion.button>
                            <button onClick={handleNext} className="p-2 text-white/60 hover:text-white transition-colors active:scale-90">
                                <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                                </svg>
                            </button>
                            <button className="p-2 text-white/30 hover:text-white/60 transition-colors active:scale-90">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </button>
                        </div>

                        {/* Action Buttons */}
                        <div className="px-4 sm:px-6 flex justify-center gap-2 sm:gap-3 mt-2 mb-1">
                            {currentSong?.youtube_id && (
                                <motion.a
                                    href={`https://www.youtube.com/watch?v=${currentSong.youtube_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-4 sm:px-6 py-2 rounded-full border border-white/20 flex items-center gap-1.5 shadow-lg transition-colors hover:bg-red-500"
                                    style={{ backgroundColor: '#ef4444', boxShadow: '0 0 16px rgba(239,68,68,0.4)' }}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <span className="text-[10px] sm:text-xs font-bold text-white uppercase tracking-wider drop-shadow-md">YouTube</span>
                                </motion.a>
                            )}
                            {selectedMood && (
                                <button
                                    onClick={() => { setView('home'); setActiveNav('home'); }}
                                    className="flex items-center justify-center gap-1.5 border border-white/20 px-4 py-2 rounded-full backdrop-blur-md transition-all active:scale-95"
                                    style={{ background: `${moodColor}30`, boxShadow: `0 0 20px ${moodColor}30` }}
                                >
                                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                    </svg>
                                    <span className="font-bold text-[10px] sm:text-xs uppercase tracking-wider text-white">Playlist</span>
                                </button>
                            )}
                        </div>

                        {/* Disposition Selector */}
                        <div className="px-4 sm:px-8 mt-2 sm:mt-4 mb-1">
                            <p className="text-center text-[8px] sm:text-[9px] tracking-[0.35em] uppercase text-white/20 mb-2">
                                Disposition
                            </p>
                            <div className="flex justify-center gap-1.5 sm:gap-2 flex-wrap">
                                {getSubMoods(selectedMood || 'happy').map((sub) => (
                                    <button key={sub}
                                        onClick={() => handleSubMoodSelect(sub)}
                                        disabled={subMoodLoading}
                                        className={`px-3 sm:px-5 py-1.5 sm:py-2 rounded-full text-[9px] sm:text-[10px] tracking-[0.15em] sm:tracking-[0.2em] uppercase font-bold transition-all active:scale-95 ${selectedSubMood === sub
                                            ? 'bg-white/10 border border-white/30 text-white'
                                            : 'border border-white/10 text-white/40 hover:text-white/70'
                                            } ${subMoodLoading ? 'opacity-50' : ''}`}>
                                        {sub}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Bottom Nav */}
                        <div className="fixed bottom-0 left-0 right-0 z-40 flex flex-col">
                            {renderMiniPlayer()}
                            <BottomNav active={activeNav} onNav={(nav) => {
                                setActiveNav(nav);
                                if (nav === 'home') { resetHomeState(); setView('home'); };
                                if (nav === 'search') setView('search');
                                if (nav === 'timeline') setView('timeline');
                            }} moodColor={moodColor} onPlaylist={() => setShowPlaylistManager(true)} onSettings={() => setShowSettings(true)} playlistOpen={showPlaylistManager} settingsOpen={showSettings} playlistCount={playlists.length} />
                        </div>
                    </motion.div>
                )}

                {view === 'camera' && (
                    /* ==================== CAMERA VIEW ==================== */
                    <CameraPage
                        onBack={() => { { resetHomeState(); setView('home'); }; setActiveNav('home'); }}
                        moodColor={moodColor}
                    />
                )}
            </AnimatePresence>

            {/* Landscape Video Overlay */}
            {landscapeMode && currentSong?.youtube_id && !dataSaver && (
                <div className="landscape-video-overlay">
                    <button
                        onClick={() => setLandscapeMode(false)}
                        className="landscape-close-btn"
                    >
                        ✕
                    </button>
                    <iframe
                        src={`https://www.youtube.com/embed/${currentSong.youtube_id}?autoplay=1&controls=1&modestbranding=1&rel=0`}
                        allow="autoplay; encrypted-media; fullscreen"
                        allowFullScreen
                        title="YouTube Landscape Player"
                    />
                </div>
            )}

            {/* Playlist Manager Slide-Over */}
            <PlaylistManager
                isOpen={showPlaylistManager}
                onClose={() => setShowPlaylistManager(false)}
                playlists={playlists}
                onCreatePlaylist={handleCreatePlaylist}
                onDeletePlaylist={handleDeletePlaylist}
                onPlayPlaylist={handlePlayPlaylist}
                onRemoveSong={handleRemoveSongFromPlaylist}
            />

            {/* Settings Panel */}
            <SettingsPanel
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                moodColor={moodColor}
                dataSaver={dataSaver}
                onDataSaver={toggleDataSaver}
                bgEffects={showBackgroundEffects}
                onBgEffects={toggleBackgroundEffects}
                autoPlay={autoPlayNext}
                onAutoPlay={toggleAutoPlayNext}
            />

            {/* Clerk Sign-In Modal */}
            <AnimatePresence>
                {showSignIn && !isSignedIn && (
                    <motion.div
                        className="fixed inset-0 z-[100] flex items-center justify-center"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowSignIn(false)} />
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="relative z-10"
                        >
                            <SignIn afterSignInUrl="/" />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ===== BOTTOM NAVIGATION =====
function BottomNav({ active, onNav, moodColor, onPlaylist, onSettings, playlistOpen, settingsOpen, playlistCount }: {
    active: string;
    onNav: (nav: 'home' | 'search' | 'timeline') => void;
    moodColor: string;
    onPlaylist: () => void;
    onSettings: () => void;
    playlistOpen?: boolean;
    settingsOpen?: boolean;
    playlistCount?: number;
}) {
    const items = [
        {
            id: 'home' as const,
            label: 'Home',
            icon: (
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
            ),
        },
        {
            id: 'search' as const,
            label: 'Search',
            icon: (
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            ),
        },
        {
            id: 'timeline' as const,
            label: 'Stats',
            icon: (
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
            ),
        },
    ];

    const anyDrawerOpen = playlistOpen || settingsOpen;

    return (
        <div className="glass-nav w-full pb-[env(safe-area-inset-bottom)]">
            <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
            <div className="flex items-center justify-around px-1 py-1.5">
                {items.map(item => {
                    const isActive = active === item.id && !anyDrawerOpen;
                    return (
                        <button
                            key={item.id}
                            onClick={() => onNav(item.id)}
                            className="flex flex-col items-center gap-0.5 min-w-[48px] min-h-[44px] justify-center px-2 py-1 rounded-xl transition-all duration-300"
                            style={isActive
                                ? { color: moodColor, background: `${moodColor}14` }
                                : { color: 'rgba(255,255,255,0.28)' }
                            }
                        >
                            {item.icon}
                            <span className="text-[7px] tracking-[0.15em] uppercase font-bold leading-none">
                                {item.label}
                            </span>
                        </button>
                    );
                })}
                <button
                    onClick={onPlaylist}
                    className="relative flex flex-col items-center gap-0.5 min-w-[48px] min-h-[44px] justify-center px-2 py-1 rounded-xl transition-all duration-300"
                    style={playlistOpen
                        ? { color: moodColor, background: `${moodColor}14` }
                        : { color: 'rgba(255,255,255,0.28)' }
                    }
                >
                    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <span className="text-[7px] tracking-[0.15em] uppercase font-bold leading-none">
                        Library
                    </span>
                    {(playlistCount ?? 0) > 0 && !playlistOpen && (
                        <span
                            className="absolute top-0 right-0.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full text-[7px] font-bold text-white px-0.5"
                            style={{ background: moodColor }}
                        >
                            {playlistCount}
                        </span>
                    )}
                </button>
                <button
                    onClick={onSettings}
                    className="flex flex-col items-center gap-0.5 min-w-[48px] min-h-[44px] justify-center px-2 py-1 rounded-xl transition-all duration-300"
                    style={settingsOpen
                        ? { color: moodColor, background: `${moodColor}14` }
                        : { color: 'rgba(255,255,255,0.28)' }
                    }
                >
                    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="text-[7px] tracking-[0.15em] uppercase font-bold leading-none">
                        Settings
                    </span>
                </button>
            </div>
        </div>
    );
}

// ===== SETTINGS PANEL =====
function SettingsPanel({ isOpen, onClose, moodColor, dataSaver, onDataSaver, bgEffects, onBgEffects, autoPlay, onAutoPlay }: {
    isOpen: boolean;
    onClose: () => void;
    moodColor: string;
    dataSaver: boolean;
    onDataSaver: (v: boolean) => void;
    bgEffects: boolean;
    onBgEffects: (v: boolean) => void;
    autoPlay: boolean;
    onAutoPlay: (v: boolean) => void;
}) {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />
                    <motion.div
                        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm flex flex-col"
                        style={{
                            background: 'rgba(12,12,20,0.98)',
                            backdropFilter: 'blur(24px)',
                            borderLeft: '1px solid rgba(255,255,255,0.06)',
                        }}
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                            <h2 className="text-sm font-black tracking-[0.2em] uppercase text-white/80">Settings</h2>
                            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white/80 transition-all">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
                            {/* Playback Section */}
                            <p className="text-[9px] tracking-[0.2em] uppercase text-white/25 font-bold mb-3 mt-1">Playback</p>

                            <SettingRow
                                label="Data Saver"
                                description="Hides background video to reduce data usage"
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                                checked={dataSaver}
                                onChange={onDataSaver}
                                moodColor={moodColor}
                            />

                            <SettingRow
                                label="Auto-Play Next"
                                description="Automatically play the next song in queue"
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                                checked={autoPlay}
                                onChange={onAutoPlay}
                                moodColor={moodColor}
                            />

                            {/* Visual Section */}
                            <p className="text-[9px] tracking-[0.2em] uppercase text-white/25 font-bold mb-3 mt-5">Visuals</p>

                            <SettingRow
                                label="Background Effects"
                                description="Animated star particles and mood gradients"
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>}
                                checked={bgEffects}
                                onChange={onBgEffects}
                                moodColor={moodColor}
                            />

                            {/* About Section */}
                            <p className="text-[9px] tracking-[0.2em] uppercase text-white/25 font-bold mb-3 mt-5">About</p>
                            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                                <p className="text-xs text-white/50 font-semibold">MoodBeats</p>
                                <p className="text-[10px] text-white/25 mt-1">AI-powered mood-based music discovery</p>
                                <p className="text-[10px] text-white/15 mt-0.5">v1.0.0</p>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

function SettingRow({ label, description, icon, checked, onChange, moodColor }: {
    label: string;
    description: string;
    icon: React.ReactNode;
    checked: boolean;
    onChange: (v: boolean) => void;
    moodColor: string;
}) {
    return (
        <button
            onClick={() => onChange(!checked)}
            className="w-full flex items-center gap-3 p-3 rounded-xl transition-all active:scale-[0.98]"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
        >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: checked ? `${moodColor}15` : 'rgba(255,255,255,0.04)', color: checked ? moodColor : 'rgba(255,255,255,0.3)' }}>
                {icon}
            </div>
            <div className="flex-1 text-left min-w-0">
                <p className="text-xs font-bold text-white/70">{label}</p>
                <p className="text-[10px] text-white/25 mt-0.5 leading-snug">{description}</p>
            </div>
            <div
                className="w-10 h-[22px] rounded-full flex-shrink-0 relative transition-colors duration-200 cursor-pointer"
                style={{ background: checked ? moodColor : 'rgba(255,255,255,0.08)' }}
            >
                <motion.div
                    className="absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-sm"
                    animate={{ left: checked ? '20px' : '3px' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
            </div>
        </button>
    );
}

function getSubMoods(mood: MoodType): string[] {
    const subMoods: Record<MoodType, string[]> = {
        happy: ['Euphoric', 'Chill', 'Groovy'],
        sad: ['Melancholic', 'Nostalgic', 'Healing'],
        gym: ['Intense', 'Cardio', 'Power'],
        study: ['Deep Focus', 'Ambient', 'Classical'],
        rock: ['Angry', 'Brooding', 'Determined'],
    };
    return subMoods[mood] || ['Angry', 'Brooding', 'Determined'];
}


// ============================================================
// Sample data with REAL YouTube video IDs for actual playback
// Memoized to avoid re-creating objects with new random values every render
// ============================================================
const songCache = new Map<MoodType, RecommendedSong[]>();

function getSampleSongs(mood: MoodType): RecommendedSong[] {
    const cached = songCache.get(mood);
    if (cached) return cached;

    const sampleData: Record<MoodType, { title: string; artist: string; album: string; ytId: string }[]> = {
        happy: [
            { title: 'Happy', artist: 'Pharrell Williams', album: 'G I R L', ytId: 'MOWDb2TBYDg' },
            { title: "Don't Stop Me Now", artist: 'Queen', album: 'Jazz', ytId: 'p1m1AIL3d_A' },
            { title: 'Uptown Funk', artist: 'Bruno Mars', album: 'Uptown Special', ytId: '0EqSXDwTq6U' },
            { title: 'Shake It Off', artist: 'Taylor Swift', album: '1989', ytId: '8xg3vE8Ie_E' },
            { title: "Can't Stop the Feeling!", artist: 'Justin Timberlake', album: 'Trolls', ytId: 'p5RobDomh5U' },
            { title: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia', ytId: 'TUVcZfQe-Kw' },
            { title: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', ytId: 'fHI8X4OXluQ' },
            { title: 'Dynamite', artist: 'BTS', album: 'BE', ytId: 'gdZLi9oWNZg' },
            { title: 'Watermelon Sugar', artist: 'Harry Styles', album: 'Fine Line', ytId: '7-x3uD5z1bQ' },
        ],
        sad: [
            { title: 'Someone Like You', artist: 'Adele', album: '21', ytId: 'njmCUJ94lqw' },
            { title: 'Fix You', artist: 'Coldplay', album: 'X&Y', ytId: 'k4V3Mo61fJM' },
            { title: 'The Night We Met', artist: 'Lord Huron', album: 'Strange Trails', ytId: 'wGF7PswOENQ' },
            { title: 'Skinny Love', artist: 'Bon Iver', album: 'For Emma Forever Ago', ytId: 'aP2Jk7b5Fm4' },
            { title: 'Creep', artist: 'Radiohead', album: 'Pablo Honey', ytId: 'XFkzRNyygfk' },
            { title: 'Hallelujah', artist: 'Jeff Buckley', album: 'Grace', ytId: 'y8AWFf7EAc4' },
            { title: 'Let Her Go', artist: 'Passenger', album: 'All the Little Lights', ytId: '16bJqA6nnsM' },
            { title: 'drivers license', artist: 'Olivia Rodrigo', album: 'SOUR', ytId: 'ZmDBbnmKFnI' },
            { title: 'Space Song', artist: 'Beach House', album: 'Depression Cherry', ytId: 'f9X1C7pTu-M' },
        ],
        gym: [
            { title: 'Stronger', artist: 'Kanye West', album: 'Graduation', ytId: 'PsO6ZnUZI0g' },
            { title: 'Eye of the Tiger', artist: 'Survivor', album: 'Eye of the Tiger', ytId: 'btPJPFnesV4' },
            { title: 'Lose Yourself', artist: 'Eminem', album: '8 Mile', ytId: '_Yhyp-_hX2s' },
            { title: 'Till I Collapse', artist: 'Eminem', album: 'The Eminem Show', ytId: 'ytQ5CYE1VZw' },
            { title: 'Power', artist: 'Kanye West', album: 'MBDTF', ytId: 'L53gjP-TtGE' },
            { title: 'Thunderstruck', artist: 'AC/DC', album: 'Razors Edge', ytId: 'v2AC41dglnM' },
            { title: 'Levels', artist: 'Avicii', album: 'True', ytId: '_ovdm2yX4MA' },
            { title: 'Radioactive', artist: 'Imagine Dragons', album: 'Night Visions', ytId: 'ktvTqknDobU' },
            { title: 'HUMBLE.', artist: 'Kendrick Lamar', album: 'DAMN.', ytId: 'tvTRZJ-4EyI' },
        ],
        study: [
            { title: 'Clair de Lune', artist: 'Claude Debussy', album: 'Suite bergamasque', ytId: 'CvFH_6DNRCY' },
            { title: 'Experience', artist: 'Ludovico Einaudi', album: 'In a Time Lapse', ytId: 'hN_q-_nGv4U' },
            { title: 'Nuvole Bianche', artist: 'Ludovico Einaudi', album: 'Una Mattina', ytId: 'xyY4IZ3JDFE' },
            { title: 'River Flows in You', artist: 'Yiruma', album: 'First Love', ytId: '7maJOI3QMu0' },
            { title: 'Intro', artist: 'The xx', album: 'xx', ytId: 'AZ1pHmRuvBo' },
            { title: 'Weightless', artist: 'Marconi Union', album: 'Weightless', ytId: 'UfcAVejslrU' },
            { title: 'Sunset Lover', artist: 'Petit Biscuit', album: 'Petit Biscuit', ytId: 'wuCK-oiE3rM' },
            { title: 'Midnight City', artist: 'M83', album: 'Hurry Up Were Dreaming', ytId: 'dX3k_QDnzHE' },
            { title: 'First Step', artist: 'Hans Zimmer', album: 'Interstellar OST', ytId: 'o_Ay_iDRAbc' },
        ],
        rock: [
            { title: 'Bohemian Rhapsody', artist: 'Queen', album: 'A Night at the Opera', ytId: 'fJ9rUzIMcZQ' },
            { title: 'Something in the Way', artist: 'Nirvana', album: 'Nevermind', ytId: 'hnRv1azouqA' },
            { title: "Sweet Child O' Mine", artist: "Guns N' Roses", album: 'Appetite', ytId: '1w7OgIMMRc4' },
            { title: 'Smells Like Teen Spirit', artist: 'Nirvana', album: 'Nevermind', ytId: 'hTWKbfoikeg' },
            { title: 'Back in Black', artist: 'AC/DC', album: 'Back in Black', ytId: 'pAgnJDJN4VA' },
            { title: 'Enter Sandman', artist: 'Metallica', album: 'Metallica', ytId: 'CD-E-LDc384' },
            { title: 'Master of Puppets', artist: 'Metallica', album: 'Master of Puppets', ytId: 'E0ozmU9cJDg' },
            { title: 'Comfortably Numb', artist: 'Pink Floyd', album: 'The Wall', ytId: '_FrOQC-zEog' },
            { title: 'Paint It Black', artist: 'Rolling Stones', album: 'Aftermath', ytId: 'O4irXQhgMqg' },
        ],
    };

    const safeAudioUrls = [
        'https://cdn.pixabay.com/audio/2022/03/15/audio_7ce17a3a60.mp3',
        'https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3',
        'https://cdn.pixabay.com/audio/2022/10/25/audio_34b3dc04c2.mp3',
        'https://cdn.pixabay.com/audio/2021/11/25/audio_91b3cb4bdc.mp3',
    ];

    const result = (sampleData[mood] || []).map((s, i) => ({
        id: `sample-${mood}-${i}`,
        title: s.title,
        artist: s.artist,
        album: s.album,
        genre: mood,
        mood_tag: mood,
        duration: 180 + (i * 17) % 120,
        cover_url: `https://picsum.photos/seed/${s.title.replace(/\s+/g, '-').toLowerCase()}/300/300`,
        audio_url: safeAudioUrls[i % safeAudioUrls.length],
        preview_url: null,
        youtube_id: s.ytId,
        valence: ((i * 37) % 100) / 100,
        energy: ((i * 53) % 100) / 100,
        danceability: ((i * 71) % 100) / 100,
        popularity: 60 + (i * 7) % 40,
        release_date: null,
        score: 0.95 - i * 0.03,
        mood_match: 0.9 - i * 0.02,
        user_similarity: 0.8 - i * 0.02,
    }));

    songCache.set(mood, result);
    return result;
}
