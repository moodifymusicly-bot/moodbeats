'use client';

import { useState, useEffect, Dispatch, SetStateAction } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoodType, MOOD_CONFIG, RecommendedSong, formatDuration } from '@/lib/types';
import YouTubePlayer from '@/components/YouTubePlayer';

interface NowPlayingProps {
    song: RecommendedSong;
    isPlaying: boolean;
    mood: MoodType;
    onTogglePlay: () => void;
    onNext: () => void;
    onPrev: () => void;
    expanded: boolean;
    onToggleExpand: () => void;
    onEnded: () => void;
    setIsPlaying: Dispatch<SetStateAction<boolean>>;
}

export default function NowPlaying({
    song,
    isPlaying,
    mood,
    onTogglePlay,
    onNext,
    onPrev,
    expanded,
    onToggleExpand,
    onEnded,
    setIsPlaying,
}: NowPlayingProps) {
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(song.duration);
    const [shuffle, setShuffle] = useState(false);
    const [repeat, setRepeat] = useState(false);
    const [ytReady, setYtReady] = useState(false);
    const moodConfig = MOOD_CONFIG[mood];

    useEffect(() => {
        setProgress(0);
        setYtReady(false);
    }, [song.id]);

    const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

    const handleYTProgress = (current: number, dur: number) => {
        setProgress(Math.floor(current));
        if (dur > 0) setDuration(Math.floor(dur));
    };

    const handleYTStateChange = (state: 'playing' | 'paused' | 'ended') => {
        if (state === 'ended') {
            onEnded();
        } else if (state === 'playing') {
            setIsPlaying(true);
        } else if (state === 'paused') {
            setIsPlaying(false);
        }
    };

    return (
        <>
            {/* YouTube Player (hidden — audio only) */}
            {song.youtube_id && (
                <YouTubePlayer
                    videoId={song.youtube_id}
                    isPlaying={isPlaying}
                    onStateChange={handleYTStateChange}
                    onProgress={handleYTProgress}
                    onReady={() => setYtReady(true)}
                />
            )}

            {/* Expanded Full-Screen Player */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        className="fixed inset-0 z-50 flex flex-col"
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                    >
                        {/* Background */}
                        <div
                            className="absolute inset-0"
                            style={{
                                background: `
                  radial-gradient(ellipse at 50% 0%, ${moodConfig.color}25 0%, transparent 60%),
                  radial-gradient(ellipse at 50% 100%, ${moodConfig.color}10 0%, transparent 50%),
                  hsl(0 0% 4%)
                `,
                            }}
                        />

                        <div className="relative z-10 flex flex-col h-full">
                            {/* Header */}
                            <div className="flex items-center justify-between p-4 sm:p-6">
                                <button onClick={onToggleExpand} className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                                <div className="text-center">
                                    <p className="text-[10px] tracking-[0.25em] uppercase text-white/30">
                                        MoodMusic // Now Playing
                                    </p>
                                    <p className="text-xs font-medium mt-0.5" style={{ color: moodConfig.color }}>
                                        {moodConfig.label} Mode
                                    </p>
                                </div>
                                <button className="p-2 -mr-2 hover:bg-white/10 rounded-full transition-colors">
                                    <svg className="w-6 h-6 text-white/50" fill="currentColor" viewBox="0 0 24 24">
                                        <circle cx="12" cy="6" r="1.5" />
                                        <circle cx="12" cy="12" r="1.5" />
                                        <circle cx="12" cy="18" r="1.5" />
                                    </svg>
                                </button>
                            </div>

                            {/* Album Art */}
                            <div className="flex-1 flex items-center justify-center px-8 sm:px-16">
                                <motion.div
                                    className="relative w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden shadow-2xl"
                                    animate={isPlaying ? { scale: [1, 1.02, 1] } : { scale: 1 }}
                                    transition={{ duration: 3, repeat: Infinity }}
                                >
                                    {song.cover_url ? (
                                        <img
                                            src={song.cover_url}
                                            alt={song.title}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div
                                            className="w-full h-full flex items-center justify-center text-6xl"
                                            style={{ background: `linear-gradient(135deg, ${moodConfig.color}40, ${moodConfig.color}10)` }}
                                        >
                                            🎵
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />


                                </motion.div>
                            </div>

                            {/* Song Info */}
                            <div className="px-8 sm:px-16 mb-4">
                                <motion.h2
                                    key={song.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="font-display text-2xl sm:text-3xl font-bold tracking-tight uppercase"
                                >
                                    {song.title}
                                </motion.h2>
                                <p className="text-white/40 text-sm sm:text-base mt-1 tracking-wider uppercase">
                                    {song.artist}
                                    {song.album && <span className="text-white/20"> // {song.album}</span>}
                                </p>
                            </div>

                            {/* Progress Bar */}
                            <div className="px-8 sm:px-16 mb-4">
                                <div className="relative h-1 bg-white/10 rounded-full overflow-hidden">
                                    <motion.div
                                        className="absolute left-0 top-0 h-full rounded-full"
                                        style={{
                                            width: `${progressPercent}%`,
                                            background: `linear-gradient(90deg, ${moodConfig.color}, ${moodConfig.color}cc)`,
                                        }}
                                    />
                                </div>
                                <div className="flex justify-between mt-2">
                                    <span className="text-[10px] font-mono" style={{ color: moodConfig.color + '80' }}>
                                        {formatDuration(progress)}
                                    </span>
                                    <span className="text-[10px] text-white/30 font-mono">
                                        {formatDuration(duration)}
                                    </span>
                                </div>
                            </div>

                            {/* Controls */}
                            <div className="flex items-center justify-center gap-8 mb-6">
                                <button
                                    onClick={() => setShuffle(!shuffle)}
                                    className={`p-2 transition-colors ${shuffle ? 'text-white' : 'text-white/30 hover:text-white/60'}`}
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h7l4 8-4 8H4M17 4h3M17 20h3M20 4l-3 3m3-3l-3-3M20 20l-3-3m3 3l-3 3" />
                                    </svg>
                                </button>
                                <button onClick={onPrev} className="p-2 text-white/60 hover:text-white transition-colors">
                                    <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                                    </svg>
                                </button>
                                <motion.button
                                    onClick={onTogglePlay}
                                    className="w-16 h-16 rounded-full bg-white flex items-center justify-center"
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    {isPlaying ? (
                                        <svg className="w-7 h-7 text-black" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                                        </svg>
                                    ) : (
                                        <svg className="w-7 h-7 text-black ml-1" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                    )}
                                </motion.button>
                                <button onClick={onNext} className="p-2 text-white/60 hover:text-white transition-colors">
                                    <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                                    </svg>
                                </button>
                                <button
                                    onClick={() => setRepeat(!repeat)}
                                    className={`p-2 transition-colors ${repeat ? 'text-white' : 'text-white/30 hover:text-white/60'}`}
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                </button>
                            </div>

                            {/* Mood sub-selector */}
                            <div className="px-8 sm:px-16 pb-8">
                                <p className="text-center text-[10px] tracking-[0.25em] uppercase text-white/20 mb-3">
                                    Select Disposition
                                </p>
                                <div className="flex justify-center gap-2">
                                    {getSubMoods(mood).map((sub) => (
                                        <button
                                            key={sub}
                                            className="px-4 py-1.5 rounded-full text-[10px] tracking-[0.15em] uppercase font-semibold transition-all glass glass-hover"
                                            style={{ borderColor: moodConfig.color + '30' }}
                                        >
                                            {sub}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Mini Player Bar */}
            {!expanded && (
                <motion.div
                    className="fixed bottom-0 left-0 right-0 z-40"
                    initial={{ y: 100 }}
                    animate={{ y: 0 }}
                    exit={{ y: 100 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                >
                    {/* Progress on top */}
                    <div className="h-[2px] bg-white/5">
                        <div
                            className="h-full transition-all duration-500"
                            style={{
                                width: `${progressPercent}%`,
                                backgroundColor: moodConfig.color,
                            }}
                        />
                    </div>

                    <div
                        className="backdrop-blur-xl border-t border-white/5 px-4 py-3"
                        style={{ background: 'rgba(8, 8, 8, 0.92)' }}
                    >
                        <div className="max-w-5xl mx-auto flex items-center gap-3">
                            {/* Album Art */}
                            <button onClick={onToggleExpand} className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                                {song.cover_url ? (
                                    <img src={song.cover_url} alt={song.title} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-white/10 flex items-center justify-center text-xl">🎵</div>
                                )}
                                {/* Equalizer bars when playing */}
                                {isPlaying && (
                                    <div className="absolute bottom-1 right-1 flex gap-[1px] items-end h-3">
                                        {[1, 2, 3].map((i) => (
                                            <motion.div
                                                key={i}
                                                className="w-[3px] rounded-full"
                                                style={{ backgroundColor: moodConfig.color }}
                                                animate={{ height: ['30%', '100%', '50%', '80%', '30%'] }}
                                                transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.12 }}
                                            />
                                        ))}
                                    </div>
                                )}
                            </button>

                            {/* Song Info */}
                            <button onClick={onToggleExpand} className="flex-1 min-w-0 text-left">
                                <p className="text-sm font-semibold truncate">{song.title}</p>
                                <p className="text-xs text-white/40 truncate">{song.artist}</p>
                            </button>

                            {/* Controls */}
                            <div className="flex items-center gap-2">
                                <button onClick={onPrev} className="p-2 text-white/50 hover:text-white">
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                                    </svg>
                                </button>
                                <motion.button
                                    onClick={onTogglePlay}
                                    className="w-10 h-10 rounded-full bg-white flex items-center justify-center"
                                    whileTap={{ scale: 0.92 }}
                                >
                                    {isPlaying ? (
                                        <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                                        </svg>
                                    ) : (
                                        <svg className="w-5 h-5 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                    )}
                                </motion.button>
                                <button onClick={onNext} className="p-2 text-white/50 hover:text-white">
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </>
    );
}

function getSubMoods(mood: MoodType): string[] {
    const subMoods: Record<MoodType, string[]> = {
        happy: ['Euphoric', 'Chill', 'Groovy'],
        sad: ['Melancholic', 'Nostalgic', 'Healing'],
        gym: ['Intense', 'Cardio', 'Power'],
        study: ['Deep Focus', 'Ambient', 'Classical'],
        rock: ['Classic', 'Heavy', 'Indie'],
        fear: ['Eerie', 'Cinematic', 'Dark'],
    };
    return subMoods[mood] || [];
}
