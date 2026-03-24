'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoodType, MOOD_CONFIG, RecommendedSong, formatDuration } from '@/lib/types';

interface SongCardProps {
    song: RecommendedSong;
    index: number;
    mood: MoodType;
    isActive: boolean;
    isPlaying: boolean;
    onPlay: () => void;
    onLike: () => void;
    isLiked?: boolean;
    onAddToPlaylist?: () => void;
}

export default function SongCard({
    song,
    index,
    mood,
    isActive,
    isPlaying,
    onPlay,
    onLike,
    isLiked = false,
    onAddToPlaylist,
}: SongCardProps) {
    const moodConfig = MOOD_CONFIG[mood];
    const [justLiked, setJustLiked] = useState(false);

    const handleLike = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isLiked) {
            setJustLiked(true);
            setTimeout(() => setJustLiked(false), 600);
        }
        onLike();
    };

    return (
        <motion.div
            variants={{
                hidden: { opacity: 0, y: 20 },
                show: { opacity: 1, y: 0 },
            }}
            className={`group relative rounded-xl overflow-hidden transition-all duration-300 cursor-pointer ${isActive
                ? 'ring-1 ring-white/20 bg-white/[0.06]'
                : 'glass glass-hover'
                }`}
            onClick={onPlay}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.99 }}
            layout
        >
            <div className="flex items-center gap-3 p-3">
                {/* Album Art */}
                <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden flex-shrink-0 bg-white/5">
                    {song.cover_url ? (
                        <img
                            src={song.cover_url}
                            alt={song.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                        />
                    ) : (
                        <div
                            className="w-full h-full flex items-center justify-center text-2xl"
                            style={{ background: `${moodConfig.color}20` }}
                        >
                            🎵
                        </div>
                    )}

                    {/* Play overlay / Currently Playing indicator */}
                    {isActive && isPlaying ? (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <div className="flex gap-[3px] items-end h-4">
                                {[1, 2, 3].map((i) => (
                                    <motion.div
                                        key={i}
                                        className="w-[3px] rounded-full"
                                        style={{ backgroundColor: moodConfig.color }}
                                        animate={{ height: ['40%', '100%', '60%', '80%', '40%'] }}
                                        transition={{
                                            duration: 0.8,
                                            repeat: Infinity,
                                            delay: i * 0.15,
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </div>
                    )}

                    {/* Active indicator bar */}
                    {isActive && (
                        <div
                            className="absolute bottom-0 left-0 right-0 h-0.5"
                            style={{ backgroundColor: moodConfig.color }}
                        />
                    )}
                </div>

                {/* Song Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <h3
                            className={`font-semibold text-sm truncate ${isActive ? 'text-white' : 'text-white/90'}`}
                            style={isActive ? { color: moodConfig.color } : {}}
                        >
                            {song.title}
                        </h3>
                        {isActive && isPlaying && (
                            <span
                                className="flex-shrink-0 text-[8px] tracking-wider uppercase font-bold px-1.5 py-0.5 rounded-full"
                                style={{ color: moodConfig.color, background: `${moodConfig.color}18` }}
                            >
                                Playing
                            </span>
                        )}
                    </div>
                    <p className="text-white/40 text-xs truncate mt-0.5">{song.artist}</p>
                    {song.album && (
                        <p className="text-white/25 text-[10px] truncate mt-0.5">{song.album}</p>
                    )}
                </div>

                {/* Duration & Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-white/30 text-xs font-mono">
                        {formatDuration(song.duration)}
                    </span>

                    {/* Like button with pulse animation */}
                    <motion.button
                        onClick={handleLike}
                        className={`p-1.5 rounded-full transition-all ${isLiked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} hover:bg-white/10`}
                        animate={justLiked ? { scale: [1, 1.4, 1] } : {}}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                    >
                        <svg
                            className={`w-4 h-4 transition-colors duration-200 ${isLiked ? 'text-red-400' : 'text-white/50 hover:text-red-400'}`}
                            fill={isLiked ? 'currentColor' : 'none'}
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                    </motion.button>

                    {/* Add to playlist button */}
                    {onAddToPlaylist && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onAddToPlaylist();
                            }}
                            className="p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all"
                        >
                            <svg className="w-4 h-4 text-white/50 hover:text-purple-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Score bar (subtle) */}
            <div className="h-[2px] bg-white/[0.03]">
                <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: moodConfig.color + '40' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${song.score * 100}%` }}
                    transition={{ delay: 0.3, duration: 0.8 }}
                />
            </div>
        </motion.div>
    );
}
