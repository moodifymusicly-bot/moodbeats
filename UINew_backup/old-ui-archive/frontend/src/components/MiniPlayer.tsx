'use client';

import { motion } from 'framer-motion';

interface MiniPlayerProps {
    currentSong: {
        id: string;
        title: string;
        artist: string;
        cover_url: string | null;
    } | null;
    isPlaying: boolean;
    progress: number;
    duration: number;
    moodColor: string; // Kept for prop compatibility
    onExpand: () => void;
    onPlayPause: () => void;
    onPrev: () => void;
    onNext: () => void;
    onClose: () => void;
}

export default function MiniPlayer({
    currentSong,
    isPlaying,
    progress,
    duration,
    onExpand,
    onPlayPause,
    onNext,
}: MiniPlayerProps) {
    if (!currentSong) return null;

    const progressPct = duration > 0 ? (progress / duration) * 100 : 0;

    return (
        <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            onClick={onExpand}
            className="mx-[16px] mb-[16px] h-[56px] rounded-[28px] bg-[var(--surface-2)] border border-[var(--border)] shadow-[0_8px_32px_rgba(0,0,0,0.4)] cursor-pointer hover:bg-[var(--surface-raised)] transition-colors relative flex items-center z-50"
            style={{ width: 'calc(100% - 32px)' }}
        >
            {/* Left: Artwork (16px from edge, 40px square, rounded 8px) */}
            <div className="ml-[16px] w-[40px] h-[40px] rounded-[8px] overflow-hidden shrink-0 bg-[var(--surface-3)] relative">
                {currentSong.cover_url && (
                    <img src={currentSong.cover_url} alt="" className="w-full h-full object-cover" />
                )}
                {isPlaying && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="flex gap-[2px] items-end h-[12px]">
                            {[0, 1, 2].map((i) => (
                                <span
                                    key={i}
                                    className="w-[2px] rounded-full animate-pulse bg-[var(--accent)]"
                                    style={{
                                        height: `${40 + i * 20}%`,
                                        animationDelay: `${i * 0.15}s`,
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Center: Title & Artist */}
            <div className="flex-1 min-w-0 px-[12px] flex flex-col justify-center h-full">
                <p className="text-[13px] font-[600] text-[var(--text-primary)] truncate">
                    {currentSong.title}
                </p>
                <p className="text-[11px] text-[var(--text-secondary)] truncate">
                    {currentSong.artist}
                </p>
            </div>

            {/* Right: Controls (16px from right edge) */}
            <div className="mr-[16px] flex items-center gap-[16px] shrink-0">
                <button
                    onClick={(e) => { e.stopPropagation(); onPlayPause(); }}
                    className="text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors active:scale-95"
                >
                    {isPlaying ? (
                        <svg className="w-[24px] h-[24px]" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
                    ) : (
                        <svg className="w-[24px] h-[24px]" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    )}
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onNext(); }}
                    className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors active:scale-95"
                >
                    <svg className="w-[20px] h-[20px]" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
                </button>
            </div>

            {/* Bottom Progress bar */}
            <div className="absolute bottom-0 left-[24px] h-[2px] bg-[var(--surface-3)] rounded-full overflow-hidden" style={{ width: 'calc(100% - 48px)' }}>
                <div
                    className="h-full bg-[var(--accent)] rounded-full"
                    style={{ width: `${progressPct}%` }}
                />
            </div>
        </motion.div>
    );
}
