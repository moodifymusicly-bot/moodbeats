'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import FaceCamera from '@/components/FaceCamera';
import YouTubePlayer from '@/components/YouTubePlayer';
import MoodTimeline, { MoodTimelineEntry, addMoodEntry } from '@/components/MoodTimeline';
import CameraPage from '@/components/CameraPage';
import { MoodType, MOOD_CONFIG, RecommendedSong, formatDuration } from '@/lib/types';

// ===== VIEWS =====
type AppView = 'landing' | 'home' | 'search' | 'playing' | 'camera' | 'media' | 'timeline';

export default function Home() {
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

    // Handle mood selection (manual or camera)
    const handleMoodSelect = (mood: MoodType) => {
        setSelectedMood(mood);
        setSongs(getSampleSongs(mood));
        // Record in mood timeline
        const updated = addMoodEntry(mood);
        setMoodHistory(updated);
    };

    const handleCameraMood = (mood: MoodType, conf: number) => {
        setDetectedEmotion(MOOD_CONFIG[mood].label);
        setDetectedConfidence(Math.round(conf * 100));
        handleMoodSelect(mood);
        setIsDetecting(false); // Reset detection state
        setCameraActive(false); // Turn off camera after auto-detect

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

        // Always load the playlist for the song's mood if not already loaded
        if (songs.length === 0 && selectedMood) {
            setSongs(getSampleSongs(selectedMood));
        }
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

        return (
            <motion.div
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 50, opacity: 0 }}
                onClick={() => setView('playing')}
                className="mx-2 mb-1 p-2 rounded-xl bg-[#2a2a35]/90 backdrop-blur-xl border border-white/5 flex items-center justify-between shadow-2xl cursor-pointer hover:bg-[#323240]/90 transition-colors"
                style={{ borderBottom: `2px solid ${moodColor}` } as any}
            >
                {/* Left: Art & Info */}
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0 bg-black relative">
                        {currentSong.cover_url && <img src={currentSong.cover_url} alt="" className="w-full h-full object-cover" />}
                        {isPlaying && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
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
                    {/* Close (X) button */}
                    <button
                        onClick={(e) => { e.stopPropagation(); setCurrentSong(null); setIsPlaying(false); }}
                        className="p-1.5 text-white/40 hover:text-red-400 transition-colors ml-1"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            </motion.div>
        );
    };

    return (
        <div className="relative border-x border-white/5 min-h-screen max-w-md mx-auto overflow-y-auto text-white" style={{ background: view === 'landing' ? '#1a1025' : '#0a0a0f' }}>
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

            {/* Global Persistent YouTube Player Layer (Always Mounted for Audio, Visible Only in 'playing' view) */}
            <div className={`absolute inset-0 z-0 overflow-hidden transition-all duration-1000 ${view === 'playing' ? (isCinemaMode ? 'opacity-100 z-40' : 'opacity-60') : 'opacity-0 pointer-events-none'}`}>
                {/* Full Screen Video Container */}
                <div
                    className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto transition-all duration-1000 ${isCinemaMode ? 'w-full h-[100vw] sm:h-full max-w-none bg-black' : 'w-[300vh] h-[300vh] max-w-none max-h-none'}`}
                    style={{ transform: `translate(-50%, -50%) rotate(${videoRotation}deg)` }}
                >
                    {currentSong?.youtube_id && (
                        <YouTubePlayer
                            videoId={currentSong.youtube_id}
                            isPlaying={isPlaying}
                            width="100%"
                            height="100%"
                            className={`w-full h-full ${isCinemaMode ? 'pointer-events-auto' : 'pointer-events-none'}`}
                            onStateChange={(state) => {
                                if (state === 'ended') handleNext();
                                else if (state === 'playing') setIsPlaying(true);
                                else if (state === 'paused') setIsPlaying(false);
                            }}
                            onProgress={(cur, dur) => { setProgress(Math.floor(cur)); setDuration(Math.floor(dur)); }}
                            onReady={() => { }}
                        />
                    )}
                    {!currentSong?.youtube_id && currentSong?.cover_url && (
                        <img src={currentSong.cover_url} alt="" className="w-full h-full object-cover blur-xl" />
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
                        className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 pb-20"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
                        transition={{ duration: 0.5 }}
                    >
                        {/* Top Logo */}
                        <div className="absolute top-10 flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-purple-600/30 flex items-center justify-center">
                                <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 24 24"><path d="M9 18V5l12-2v13M9 18c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-2" /></svg>
                            </div>
                            <span className="font-display font-black tracking-wide text-lg">Mood-Swinger</span>
                        </div>

                        {/* Center Graphic */}
                        <motion.div
                            className="relative w-64 h-64 rounded-full border-[3px] border-purple-600/50 flex items-center justify-center mb-10 mt-10"
                            style={{
                                background: 'radial-gradient(circle at center, rgba(139, 92, 246, 0.15) 0%, transparent 70%)',
                                boxShadow: '0 0 60px rgba(139, 92, 246, 0.2)'
                            }}
                            animate={{ rotate: 360 }}
                            transition={{ duration: 120, repeat: Infinity, ease: "linear" }}
                        >
                            {/* Abstract waveform image placeholder using gradient */}
                            <div className="w-full h-8 flex items-center justify-center gap-[2px] px-8">
                                {[...Array(40)].map((_, i) => (
                                    <motion.div
                                        key={i}
                                        className="w-1 rounded-full"
                                        style={{
                                            background: `linear-gradient(to top, #fbbf24, #ec4899, #3b82f6)`,
                                            height: `${20 + Math.random() * 80}%`
                                        }}
                                    />
                                ))}
                            </div>

                            {/* Floating Play Icon */}
                            <motion.div
                                className="absolute -bottom-2 right-4 w-14 h-14 bg-purple-500 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.5)] cursor-pointer"
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.95 }}
                            >
                                <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                            </motion.div>
                        </motion.div>

                        <h1 className="text-4xl sm:text-5xl font-display font-black tracking-tight mb-3">
                            Mood-Swinger
                        </h1>
                        <p className="text-white/50 text-sm mb-12 font-medium">
                            Music that moves with your mood.
                        </p>

                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => {
                                // Use a punchy drum hit sound for Get Started
                                const hitSound = new Audio('https://s3.amazonaws.com/freecodecamp/drums/Kick_n_Hat.mp3');
                                hitSound.volume = 0.5;
                                hitSound.play().catch(() => { }); // ignore error if browser blocks autoplay wrapper

                                { resetHomeState(); setView('home'); };
                            }}
                            className="w-full max-w-[280px] bg-purple-600 hover:bg-purple-500 text-white font-bold py-4 rounded-xl shadow-[0_0_30px_rgba(147,51,234,0.4)] transition-colors text-lg tracking-wide"
                        >
                            Get Started
                        </motion.button>

                        <div className="mt-12 mb-6 flex items-center justify-center gap-4 text-white/50 text-xs tracking-[0.3em] font-black uppercase w-full">
                            <span className="w-12 h-[2px] bg-white/20" />
                            <span className="drop-shadow-lg">Discover More</span>
                            <span className="w-12 h-[2px] bg-white/20" />
                        </div>

                        {/* Large gap to separate CLOSE APP from the rest of the UI */}
                        <div className="mt-16 w-full flex flex-col items-center justify-center gap-8 text-white/40">
                            {/* Close App Button */}
                            <button onClick={() => window.close()}
                                className="group relative w-full max-w-[200px] flex items-center justify-center gap-3 overflow-hidden rounded-full p-[2px] transition-all hover:scale-105 active:scale-95">
                                <span className="absolute inset-0 bg-gradient-to-r from-red-600 via-orange-500 to-red-600 rounded-full opacity-70 group-hover:animate-pulse" />
                                <div className="relative flex items-center justify-center gap-2 w-full bg-[#1a1025] rounded-full py-2.5 px-6 group-hover:bg-transparent transition-colors">
                                    <svg className="w-4 h-4 text-red-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    <span className="font-black text-xs tracking-widest text-red-50 uppercase group-hover:text-white drop-shadow-md">CLOSE APP</span>
                                </div>
                            </button>

                            {/* Decorative bottom icons */}
                            <div className="flex gap-8 mb-4 opacity-50">
                                <svg className="w-5 h-5 hover:text-white/80 transition-colors cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-2" /></svg>
                                <svg className="w-5 h-5 hover:text-white/80 transition-colors cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" /></svg>
                                <svg className="w-5 h-5 hover:text-white/80 transition-colors cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                            </div>
                        </div>
                    </motion.div>
                )}

                {view === 'home' && (
                    /* ==================== HOME VIEW ==================== */
                    <motion.div
                        key="home"
                        className="relative z-10 flex flex-col min-h-screen pb-28"
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
                                    {songs.length > 0 ? `${MOOD_CONFIG[selectedMood!]?.label} Playlist` : 'Mood-Swinger'}
                                </h1>
                                <div className="w-5 h-0.5 rounded-full mx-auto mt-1" style={{ backgroundColor: moodColor }} />
                            </div>
                            <button className="p-1">
                                <svg className="w-5 h-5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                            </button>
                        </div>

                        {/* Start Detection / Camera Section */}
                        <div className="px-5 mt-2">
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
                                        className="text-center py-4"
                                    >
                                        <h2 className="text-2xl sm:text-3xl font-display font-black tracking-tight">
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
                                                onClick={() => { setCameraActive(true); setIsDetecting(true); }}
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
                        <div className="px-5 mt-4">
                            <p className="text-[9px] tracking-[0.35em] uppercase text-center text-white/20 mb-3">
                                Select Disposition
                            </p>
                            <div className="flex flex-wrap justify-center gap-2">
                                {(['happy', 'sad', 'gym', 'study', 'rock', 'fear'] as MoodType[]).map((mood) => (
                                    <motion.button
                                        key={mood}
                                        onClick={() => handleMoodSelect(mood)}
                                        whileTap={{ scale: 0.95 }}
                                        className={`px-4 py-2 rounded-full text-[10px] tracking-[0.2em] uppercase font-bold transition-all duration-300 ${selectedMood === mood
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
                        <div className="px-5 mt-4">
                            <div className="relative">
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

                        {/* Song List */}
                        {songs.length > 0 && (
                            <div className="px-5 mt-6 flex-1 overflow-y-auto pb-24">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-[10px] tracking-[0.3em] uppercase text-white/30 font-semibold">
                                        Most Wanted Tracks
                                    </h3>
                                    <span className="text-[9px] tracking-[0.2em] uppercase font-bold px-2 py-0.5 rounded border"
                                        style={{ color: moodColor, borderColor: moodColor + '40' }}>
                                        Neural Sync
                                    </span>
                                </div>

                                <motion.div className="space-y-1" initial="hidden" animate="show"
                                    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}>
                                    {songs
                                        .filter(song => !artistFilter.trim() || song.artist.toLowerCase().includes(artistFilter.toLowerCase()))
                                        .map((song, i) => (
                                            <motion.button
                                                key={song.id}
                                                onClick={() => handleSongPlay(song)}
                                                variants={{ hidden: { opacity: 0, x: -20 }, show: { opacity: 1, x: 0 } }}
                                                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left group ${currentSong?.id === song.id
                                                    ? 'bg-white/[0.06] border border-white/10'
                                                    : 'hover:bg-white/[0.03]'
                                                    }`}
                                            >
                                                {/* Album art */}
                                                <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-white/5">
                                                    <img src={song.cover_url || ''} alt="" className="w-full h-full object-cover" loading="lazy" />
                                                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <svg className="w-5 h-5" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                                    </div>
                                                    {currentSong?.id === song.id && isPlaying && (
                                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                                            <div className="flex gap-[2px] items-end h-4">
                                                                {[1, 2, 3].map(j => (
                                                                    <motion.div key={j} className="w-[3px] rounded-full"
                                                                        style={{ backgroundColor: moodColor }}
                                                                        animate={{ height: ['30%', '100%', '50%', '80%', '30%'] }}
                                                                        transition={{ duration: 0.7, repeat: Infinity, delay: j * 0.12 }} />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-sm font-semibold truncate ${currentSong?.id === song.id ? 'text-white' : 'text-white/80'}`}
                                                        style={currentSong?.id === song.id ? { color: moodColor } : {}}>
                                                        {song.title}
                                                    </p>
                                                    <p className="text-xs text-white/30 truncate">{song.artist}</p>
                                                </div>
                                                <span className="text-xs text-white/20 font-mono flex-shrink-0">
                                                    {formatDuration(song.duration)}
                                                </span>
                                                <button className="p-1 opacity-0 group-hover:opacity-100">
                                                    <svg className="w-4 h-4 text-white/30" fill="currentColor" viewBox="0 0 24 24">
                                                        <circle cx="12" cy="6" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="18" r="1.5" />
                                                    </svg>
                                                </button>
                                            </motion.button>
                                        ))}
                                </motion.div>
                            </div>
                        )}

                        {/* Bottom Nav */}
                        <div className="fixed bottom-0 left-0 right-0 z-40 max-w-md mx-auto flex flex-col">
                            {renderMiniPlayer()}
                            <BottomNav active={activeNav} onNav={(nav) => {
                                setActiveNav(nav);
                                if (nav === 'search') setView('search');
                                if (nav === 'home') { resetHomeState(); setView('home'); };
                                if (nav === 'timeline') setView('timeline');
                            }} moodColor={moodColor} />
                        </div>
                    </motion.div>
                )}

                {view === 'search' && (
                    /* ==================== SEARCH VIEW ==================== */
                    <motion.div
                        key="search"
                        className="relative z-10 flex flex-col min-h-screen pb-28"
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                    >
                        <div className="flex items-center justify-between px-5 pt-4 pb-2">
                            <button onClick={() => { { resetHomeState(); setView('home'); }; setActiveNav('home'); }} className="p-1">
                                <svg className="w-6 h-6 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <h1 className="text-xs tracking-[0.3em] uppercase font-bold text-white/80">Global Search</h1>
                            <div className="w-6" />
                        </div>

                        <div className="px-5 mt-4 flex-1 flex flex-col">
                            <input
                                autoFocus
                                type="text"
                                placeholder="Search any artist or track..."
                                value={artistFilter}
                                onChange={(e) => setArtistFilter(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-sm text-white placeholder-white/40 focus:outline-none focus:border-purple-500 focus:bg-white/10 transition-all font-display tracking-wide"
                            />

                            <div className="mt-6 space-y-1 overflow-y-auto pb-24">
                                {/* Flatten all sample songs for global search */}
                                {Object.values(['happy', 'sad', 'gym', 'study', 'rock', 'fear'] as MoodType[])
                                    .flatMap(m => getSampleSongs(m))
                                    .filter((s, idx, arr) => arr.findIndex(t => t.title === s.title) === idx) // deduplicate
                                    .filter(song => !artistFilter.trim() ||
                                        song.artist.toLowerCase().includes(artistFilter.toLowerCase()) ||
                                        song.title.toLowerCase().includes(artistFilter.toLowerCase()))
                                    .slice(0, 15) // Limit results for performance
                                    .map((song) => (
                                        <motion.button
                                            key={song.id}
                                            onClick={() => handleSongPlay(song)}
                                            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left group hover:bg-white/[0.05]`}
                                        >
                                            <div className="w-12 h-12 rounded-lg bg-white/10 overflow-hidden relative">
                                                <img src={song.cover_url || ''} className="w-full h-full object-cover" alt="" />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                    <svg className="w-5 h-5" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold truncate text-white">{song.title}</p>
                                                <p className="text-xs text-white/40 truncate">{song.artist}</p>
                                            </div>
                                            <span className="text-xs text-white/20 font-mono flex-shrink-0">
                                                {formatDuration(song.duration)}
                                            </span>
                                        </motion.button>
                                    ))}
                            </div>
                        </div>

                        <div className="fixed bottom-0 left-0 right-0 z-40 max-w-md mx-auto flex flex-col">
                            {renderMiniPlayer()}
                            <BottomNav active="search" onNav={(nav) => {
                                setActiveNav(nav);
                                if (nav === 'home') { resetHomeState(); setView('home'); };
                                if (nav === 'search') setView('search');
                                if (nav === 'timeline') setView('timeline');
                            }} moodColor="#8b5cf6" />
                        </div>
                    </motion.div>
                )}

                {view === 'timeline' && (
                    /* ==================== MOOD TIMELINE VIEW ==================== */
                    <motion.div
                        key="timeline"
                        className="relative z-10 flex flex-col min-h-screen pb-28"
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

                        <div className="px-5 mt-4 flex-1 flex flex-col overflow-y-auto pb-24">
                            {/* Timeline visualization */}
                            <MoodTimeline entries={moodHistory} moodColor={moodColor} />

                            {/* Detailed mood log list */}
                            <div className="mt-6">
                                <h2 className="text-[10px] tracking-[0.3em] uppercase text-white/40 font-bold mb-3">Detailed Log (Last 24 Hours)</h2>
                                {moodHistory.length === 0 ? (
                                    <div className="text-center py-10">
                                        <div className="text-4xl mb-3">📊</div>
                                        <p className="text-sm text-white/30">No moods logged yet</p>
                                        <p className="text-xs text-white/15 mt-1">Use Start Detection to detect your mood</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {[...moodHistory]
                                            .filter(e => new Date(e.timestamp).getTime() > Date.now() - 24 * 60 * 60 * 1000)
                                            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                                            .map((entry, idx) => {
                                                const time = new Date(entry.timestamp);
                                                const config = MOOD_CONFIG[entry.mood];
                                                return (
                                                    <motion.div
                                                        key={idx}
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: idx * 0.04 }}
                                                        className="flex items-center gap-3 p-3 rounded-xl border border-white/5"
                                                        style={{ backgroundColor: `${entry.color}08` }}
                                                    >
                                                        {/* Time */}
                                                        <div className="flex-shrink-0 text-center w-16">
                                                            <p className="text-xs font-mono font-bold" style={{ color: entry.color }}>
                                                                {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                            </p>
                                                            <p className="text-[8px] text-white/20 font-mono mt-0.5">
                                                                {time.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                                            </p>
                                                        </div>

                                                        {/* Color bar */}
                                                        <div className="w-1 h-10 rounded-full" style={{ backgroundColor: entry.color }} />

                                                        {/* Mood info */}
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-lg">{config?.emoji}</span>
                                                                <span className="text-sm font-bold uppercase tracking-wider" style={{ color: entry.color }}>
                                                                    {config?.label}
                                                                </span>
                                                            </div>
                                                            <p className="text-[9px] text-white/20 mt-0.5">{config?.description}</p>
                                                        </div>

                                                        {/* Color dot */}
                                                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color, boxShadow: `0 0 8px ${entry.color}60` }} />
                                                    </motion.div>
                                                );
                                            })
                                        }
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="fixed bottom-0 left-0 right-0 z-40 max-w-md mx-auto flex flex-col">
                            {renderMiniPlayer()}
                            <BottomNav active="timeline" onNav={(nav) => {
                                setActiveNav(nav);
                                if (nav === 'home') { resetHomeState(); setView('home'); };
                                if (nav === 'search') setView('search');
                                if (nav === 'timeline') setView('timeline');
                            }} moodColor="#8b5cf6" />
                        </div>
                    </motion.div>
                )}

                {view === 'playing' && (
                    /* ==================== NOW PLAYING VIEW ==================== */
                    <motion.div
                        key="playing"
                        className={`relative z-10 flex flex-col min-h-screen transition-opacity duration-700 ${isCinemaMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
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
                                    Mood-Swinger // Media
                                </p>
                                <p className="text-xs font-black tracking-widest uppercase drop-shadow-lg text-white">Now Playing</p>
                            </div>
                            <button onClick={toggleCinemaMode} className="p-1 relative z-30 pointer-events-auto group">
                                <svg className="w-5 h-5 text-white/80 drop-shadow-md group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                </svg>
                            </button>
                        </div>

                        {/* LIVE Badge (moved from video container) */}
                        {currentSong?.youtube_id && (
                            <div className="absolute top-16 right-5 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-600/90 text-white backdrop-blur shadow-xl border border-red-500/50 z-30">
                                <span className="w-2 h-2 rounded-full bg-white animate-pulse shadow-[0_0_10px_white]" />
                                <span className="text-[10px] font-black tracking-widest uppercase drop-shadow">LIVE</span>
                            </div>
                        )}

                        {/* Album Art (Transparent Placeholder since global layer handles video) */}
                        <div className={`flex-1 flex items-center justify-center px-10 py-4 ${currentSong?.youtube_id ? 'opacity-0' : ''}`}>
                            <div className="w-full aspect-square max-w-[300px]" />
                        </div>

                        {/* Song Info */}
                        {currentSong && (
                            <div className="px-8">
                                <motion.h2 key={currentSong.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                    className="font-display text-xl sm:text-2xl font-black tracking-tight uppercase text-center">
                                    {currentSong.title}
                                </motion.h2>
                                <p className="text-center text-white/30 text-xs tracking-[0.2em] uppercase mt-1">
                                    {currentSong.artist} // {currentSong.album}
                                </p>
                            </div>
                        )}

                        {/* Progress Bar */}
                        <div className="px-8 mt-5">
                            <div className="relative h-[3px] bg-white/10 rounded-full overflow-hidden">
                                <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
                                    style={{
                                        width: `${duration > 0 ? (progress / duration) * 100 : 0}%`,
                                        backgroundColor: moodColor,
                                    }}
                                />
                            </div>
                            <div className="flex justify-between mt-1.5">
                                <span className="text-[10px] font-mono" style={{ color: moodColor + '90' }}>
                                    {formatDuration(progress)}
                                </span>
                                <span className="text-[10px] text-white/20 font-mono">
                                    {formatDuration(duration || currentSong?.duration || 0)}
                                </span>
                            </div>
                        </div>

                        {/* Playback Controls */}
                        <div className="flex items-center justify-center gap-8 mt-6">
                            <button className="p-2 text-white/30 hover:text-white/60 transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                        d="M4 4h7l4 8-4 8H4M17 4h3M17 20h3M20 4l-3 3m3-3l-3-3M20 20l-3-3m3 3l-3 3" />
                                </svg>
                            </button>
                            <button onClick={handlePrev} className="p-2 text-white/60 hover:text-white transition-colors">
                                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                                </svg>
                            </button>
                            <motion.button
                                onClick={() => setIsPlaying(!isPlaying)}
                                className="w-20 h-20 rounded-full flex items-center justify-center relative overflow-hidden group"
                                style={{
                                    background: moodColor,
                                    boxShadow: `0 0 40px ${moodColor}50, inset 0 -4px 10px rgba(0,0,0,0.3)`,
                                }}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                            >
                                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                {isPlaying ? (
                                    <svg className="w-8 h-8 text-white drop-shadow-md" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                                    </svg>
                                ) : (
                                    <svg className="w-8 h-8 text-white ml-2 drop-shadow-md" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                )}
                            </motion.button>
                            <button onClick={handleNext} className="p-2 text-white/60 hover:text-white transition-colors">
                                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                                </svg>
                            </button>
                            <button className="p-2 text-white/30 hover:text-white/60 transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </button>
                        </div>

                        {/* Action Buttons (Rotate + Landscape + Playlist) */}
                        <div className="px-6 flex justify-center gap-3 mt-8 mb-4">
                            <button
                                onClick={handleRotateVideo}
                                className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 px-4 py-2.5 rounded-full backdrop-blur-md transition-all active:scale-95"
                                style={{ boxShadow: `0 0 20px ${moodColor}20` }}
                            >
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                <span className="font-bold text-xs uppercase tracking-widest text-white">Rotate</span>
                            </button>
                            {currentSong?.youtube_id && (
                                <button
                                    onClick={() => setLandscapeMode(true)}
                                    className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 px-4 py-2.5 rounded-full backdrop-blur-md transition-all active:scale-95"
                                    style={{ boxShadow: `0 0 20px ${moodColor}20` }}
                                >
                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                    <span className="font-bold text-xs uppercase tracking-widest text-white">Landscape</span>
                                </button>
                            )}
                            {/* Playlist Button */}
                            {selectedMood && (
                                <button
                                    onClick={() => { setView('home'); setActiveNav('home'); }}
                                    className="flex items-center justify-center gap-2 border border-white/20 px-4 py-2.5 rounded-full backdrop-blur-md transition-all active:scale-95"
                                    style={{ background: `${moodColor}30`, boxShadow: `0 0 20px ${moodColor}30` }}
                                >
                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                    </svg>
                                    <span className="font-bold text-xs uppercase tracking-widest text-white">Playlist</span>
                                </button>
                            )}
                        </div>

                        {/* Disposition Selector */}
                        <div className="px-8 mt-6 mb-4">
                            <p className="text-center text-[9px] tracking-[0.35em] uppercase text-white/20 mb-3">
                                Select Disposition
                            </p>
                            <div className="flex justify-center gap-2">
                                {getSubMoods(selectedMood || 'happy').map((sub, i) => (
                                    <button key={sub}
                                        className={`px-5 py-2 rounded-full text-[10px] tracking-[0.2em] uppercase font-bold transition-all ${i === 1
                                            ? 'bg-white/10 border border-white/30 text-white'
                                            : 'border border-white/10 text-white/40 hover:text-white/70'
                                            }`}>
                                        {sub}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Bottom Nav */}
                        <div className="fixed bottom-0 left-0 right-0 z-40 max-w-md mx-auto flex flex-col">
                            {renderMiniPlayer()}
                            <BottomNav active={activeNav} onNav={(nav) => {
                                setActiveNav(nav);
                                if (nav === 'home') { resetHomeState(); setView('home'); };
                                if (nav === 'search') setView('search');
                                if (nav === 'timeline') setView('timeline');
                            }} moodColor={moodColor} />
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
            {landscapeMode && currentSong?.youtube_id && (
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
        </div>
    );
}

// ===== BOTTOM NAVIGATION =====
function BottomNav({ active, onNav, moodColor }: {
    active: string;
    onNav: (nav: 'home' | 'search' | 'timeline') => void;
    moodColor: string;
}) {
    const items = [
        {
            id: 'home' as const, icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
            )
        },
        {
            id: 'search' as const, icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            )
        },
        {
            id: 'timeline' as const, icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            )
        },
    ];

    return (
        <div className="backdrop-blur-xl border-t border-white/5"
            style={{ background: 'rgba(10,10,15,0.95)' }}>
            <div className="flex items-center justify-around py-3">
                {items.map(item => (
                    <button key={item.id} onClick={() => onNav(item.id)}
                        className={`p-2 transition-colors ${active === item.id ? 'text-white' : 'text-white/30'}`}
                        style={active === item.id ? { color: moodColor } : {}}>
                        {item.icon}
                    </button>
                ))}
            </div>
        </div>
    );
}

function getSubMoods(mood: MoodType): string[] {
    const subMoods: Record<MoodType, string[]> = {
        happy: ['Euphoric', 'Chill', 'Groovy'],
        sad: ['Melancholic', 'Nostalgic', 'Healing'],
        gym: ['Intense', 'Cardio', 'Power'],
        study: ['Deep Focus', 'Ambient', 'Classical'],
        rock: ['Angry', 'Brooding', 'Determined'],
        fear: ['Eerie', 'Cinematic', 'Dark'],
    };
    return subMoods[mood] || ['Angry', 'Brooding', 'Determined'];
}


// ============================================================
// Sample data with REAL YouTube video IDs for actual playback
// ============================================================
function getSampleSongs(mood: MoodType): RecommendedSong[] {
    const sampleData: Record<MoodType, { title: string; artist: string; album: string; ytId: string }[]> = {
        happy: [
            { title: 'Happy', artist: 'Pharrell Williams', album: 'G I R L', ytId: 'ZbZSe6N_BXs' },
            { title: "Don't Stop Me Now", artist: 'Queen', album: 'Jazz', ytId: 'HgzGwKwLmgM' },
            { title: 'Uptown Funk', artist: 'Bruno Mars', album: 'Uptown Special', ytId: 'OPf0YbXqDm0' },
            { title: 'Shake It Off', artist: 'Taylor Swift', album: '1989', ytId: 'nfWlot6h_JM' },
            { title: "Can't Stop the Feeling!", artist: 'Justin Timberlake', album: 'Trolls', ytId: 'ru0K8uYEZWw' },
            { title: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia', ytId: 'TUVcZfQe-Kw' },
            { title: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', ytId: '4NRXx6U8ABQ' },
            { title: 'Dynamite', artist: 'BTS', album: 'BE', ytId: 'gdZLi9oWNZg' },
            { title: 'Watermelon Sugar', artist: 'Harry Styles', album: 'Fine Line', ytId: 'E07s5ZYadZs' },
            { title: '24K Magic', artist: 'Bruno Mars', album: '24K Magic', ytId: 'UqyT8IEBkvY' },
            { title: 'Good as Hell', artist: 'Lizzo', album: 'Cuz I Love You', ytId: 'SmbmeOgWsqE' },
            { title: 'Walking on Sunshine', artist: 'Katrina & the Waves', album: 'Walking on Sunshine', ytId: 'iPUmE-tne5U' },
        ],
        sad: [
            { title: 'Someone Like You', artist: 'Adele', album: '21', ytId: 'hLQl3WQQoQ0' },
            { title: 'Fix You', artist: 'Coldplay', album: 'X&Y', ytId: 'k4V3Mo61fJM' },
            { title: 'The Night We Met', artist: 'Lord Huron', album: 'Strange Trails', ytId: 'KtlgYxa6BMU' },
            { title: 'Skinny Love', artist: 'Bon Iver', album: 'For Emma Forever Ago', ytId: 'ssdgFoHLwnk' },
            { title: 'Creep', artist: 'Radiohead', album: 'Pablo Honey', ytId: 'XFkzRNyygfk' },
            { title: 'Hallelujah', artist: 'Jeff Buckley', album: 'Grace', ytId: 'y8AWFf7EAc4' },
            { title: 'Let Her Go', artist: 'Passenger', album: 'All the Little Lights', ytId: 'RBumgq5yVrA' },
            { title: 'drivers license', artist: 'Olivia Rodrigo', album: 'SOUR', ytId: 'ZmDBbnmKFnI' },
            { title: 'Space Song', artist: 'Beach House', album: 'Depression Cherry', ytId: 'f9X1C7pTu-M' },
            { title: 'Numb', artist: 'Linkin Park', album: 'Meteora', ytId: 'kXYiU_JCYtU' },
            { title: 'My Immortal', artist: 'Evanescence', album: 'Fallen', ytId: '5anLPw0Efmo' },
            { title: 'Chasing Cars', artist: 'Snow Patrol', album: 'Eyes Open', ytId: 'GemKqzILV4w' },
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
            { title: 'Titanium', artist: 'David Guetta ft. Sia', album: 'Nothing but the Beat', ytId: 'JRfuAukYTKg' },
            { title: 'Unstoppable', artist: 'Sia', album: 'This Is Acting', ytId: 'cxjvTXo9WWM' },
            { title: 'We Will Rock You', artist: 'Queen', album: 'News of the World', ytId: '-tJYN-eG1zk' },
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
            { title: 'Holocene', artist: 'Bon Iver', album: 'Bon Iver', ytId: 'TWcyIpul8OE' },
            { title: 'Gymnopedie No. 1', artist: 'Erik Satie', album: 'Trois Gymnopedies', ytId: 'S-Xm7s9eGxU' },
            { title: 'Nocturne Op. 9 No. 2', artist: 'Chopin', album: 'Nocturnes', ytId: '9E6b3swbnWg' },
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
            { title: 'Hysteria', artist: 'Muse', album: 'Absolution', ytId: '3dm_5qWWDV8' },
            { title: 'Chop Suey!', artist: 'System of a Down', album: 'Toxicity', ytId: 'CSvFpBOe8eY' },
            { title: 'Kashmir', artist: 'Led Zeppelin', album: 'Physical Graffiti', ytId: 'tzVJPgCn-Z8' },
        ],
        fear: [
            { title: 'Thriller', artist: 'Michael Jackson', album: 'Thriller', ytId: 'sOnqjkJTMaA' },
            { title: 'O Fortuna', artist: 'Carl Orff', album: 'Carmina Burana', ytId: 'GXFSK0ogeg4' },
            { title: 'Hall of the Mountain King', artist: 'Edvard Grieg', album: 'Peer Gynt', ytId: 'kLp_Hh6DKWc' },
            { title: 'Bury a Friend', artist: 'Billie Eilish', album: 'WWAFAWDWG', ytId: 'HUHC9tYz8ik' },
            { title: 'Sweet Dreams', artist: 'Eurythmics', album: 'Sweet Dreams', ytId: 'qeMFqkcPYcg' },
            { title: 'Closer', artist: 'Nine Inch Nails', album: 'The Downward Spiral', ytId: 'PTFwQP86BRs' },
            { title: 'Duel of the Fates', artist: 'John Williams', album: 'Star Wars TPM', ytId: 'xlYCxbBZUCY' },
            { title: 'Requiem for a Dream', artist: 'Clint Mansell', album: 'Requiem OST', ytId: 'yVIRcnlRKF8' },
            { title: 'Lacrimosa', artist: 'Mozart', album: 'Requiem', ytId: 'k1-TrAvp_xs' },
            { title: 'Night on Bald Mountain', artist: 'Mussorgsky', album: 'Pictures', ytId: 'iCEDfZgDPS8' },
            { title: '28 Days Later', artist: 'John Murphy', album: '28 Days Later OST', ytId: 'ST2H8FWDvEA' },
            { title: 'Nightmare', artist: 'Avenged Sevenfold', album: 'Nightmare', ytId: '94bGzWyHbu0' },
        ],
    };

    return (sampleData[mood] || []).map((s, i) => ({
        id: `sample-${mood}-${i}`,
        title: s.title,
        artist: s.artist,
        album: s.album,
        genre: mood,
        mood_tag: mood,
        duration: 180 + Math.floor(Math.random() * 120),
        cover_url: `https://picsum.photos/seed/${s.title.replace(/\s+/g, '-').toLowerCase()}/300/300`,
        audio_url: null,
        preview_url: null,
        youtube_id: s.ytId,
        valence: Math.random(),
        energy: Math.random(),
        danceability: Math.random(),
        popularity: 60 + Math.floor(Math.random() * 40),
        release_date: null,
        score: 0.95 - i * 0.03,
        mood_match: 0.9 - i * 0.02,
        user_similarity: 0.8 - i * 0.02,
    }));
}
