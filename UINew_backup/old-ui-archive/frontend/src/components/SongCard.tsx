'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { MoodType, RecommendedSong, formatDuration } from '@/lib/types';

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
    isActive,
    isPlaying,
    onPlay,
}: SongCardProps) {
    return (
        <motion.div
            className="track-card relative flex flex-col w-[140px] shrink-0 cursor-pointer group"
            onClick={onPlay}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
        >
            {/* Thumbnail */}
            <div className="relative w-full aspect-square rounded-[var(--r-md)] overflow-hidden bg-[var(--surface-2)]">
                {song.cover_url ? (
                    <img
                        src={song.cover_url}
                        alt={song.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl opacity-20">
                        🎵
                    </div>
                )}

                {/* Duration Badge Overlay */}
                <div className="absolute bottom-1 right-1 px-[5px] py-[2px] rounded-[4px] text-[10px] text-white z-10 font-mono tracking-wide" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
                    {formatDuration(song.duration)}
                </div>

                {/* Play overlay / Currently Playing indicator */}
                {isActive && isPlaying ? (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
                        <div className="flex gap-[3px] items-end h-4">
                            {[1, 2, 3].map((i) => (
                                <motion.div
                                    key={i}
                                    className="w-[3px] rounded-full bg-[var(--accent)]"
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
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20">
                        <svg className="w-8 h-8 text-white drop-shadow-md" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                )}
                
                {/* Active indicator border */}
                {isActive && (
                    <div className="absolute inset-0 border-2 border-[var(--accent)] rounded-[var(--r-md)] pointer-events-none z-30" />
                )}
            </div>

            {/* Song Info */}
            <div className="mt-[8px] flex flex-col">
                <h3 className={`text-[13px] font-[500] truncate ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                    {song.title}
                </h3>
                <p className="text-[11px] text-[var(--text-secondary)] truncate mt-[2px]">
                    {song.artist}
                </p>
            </div>
        </motion.div>
    );
}
