'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import BottomNav from '@/components/BottomNav';
import { MoodType, MOOD_CONFIG, RecommendedSong, formatDuration } from '@/lib/types';
import { getSubMoods, FALLBACK_CARD_MOOD } from '@/lib/appState';

interface PlayingViewProps {
    currentSong: RecommendedSong | null;
    selectedMood: MoodType | null;
    moodColor: string;
    isPlaying: boolean;
    isMuted: boolean;
    autoplayBlocked: boolean;
    isCinemaMode: boolean;
    dataSaver: boolean;
    progress: number;
    duration: number;
    selectedSubMood: string | null;
    subMoodLoading: boolean;
    activeNav: string;
    // Handlers
    onPlayPause: () => void;
    onPrev: () => void;
    onNext: () => void;
    onUnmute: () => void;
    onStartPlayback: () => void;
    onToggleCinema: () => void;
    onSubMoodSelect: (sub: string) => void;
    onNavHome: () => void;
    onNavSearch: () => void;
    onNavTimeline: () => void;
    onNavLanding: () => void;
    onGoToPlaylist: () => void;
    // Nav extras
    onPlaylist: () => void;
    onSettings: () => void;
    showPlaylistManager: boolean;
    showSettings: boolean;
    playlistCount: number;
}

export default function PlayingView(props: PlayingViewProps) {
    const {
        currentSong, selectedMood, moodColor, isPlaying, isMuted, autoplayBlocked,
        isCinemaMode, dataSaver, progress, duration, selectedSubMood, subMoodLoading,
        activeNav,
        onPlayPause, onPrev, onNext, onUnmute, onStartPlayback,
        onToggleCinema, onSubMoodSelect,
        onNavHome, onNavSearch, onNavTimeline, onNavLanding, onGoToPlaylist,
        onPlaylist, onSettings, showPlaylistManager, showSettings, playlistCount,
    } = props;

    const currentDuration = duration || currentSong?.duration || 0;
    const [imgError, setImgError] = useState(false);

    return (
        <motion.div
            key="playing"
            className={`relative z-20 flex flex-col h-[100dvh] w-full overflow-hidden transition-opacity duration-700 ${isCinemaMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
        >
            {/* 1. TOP BAR */}
            <div className="flex-none h-[var(--nav-height)] flex items-center justify-between px-[20px] pt-[16px]">
                <button onClick={onNavHome} className="p-2 -ml-2 group" aria-label="Minimize">
                    <svg className="w-6 h-6 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                <div className="flex-1 text-center font-[700] tracking-[2px] uppercase text-[var(--text-secondary)] text-[11px]">
                    NOW PLAYING
                </div>
                <button onClick={onGoToPlaylist} className="p-2 -mr-2 group" aria-label="Menu">
                    <svg className="w-6 h-6 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                    </svg>
                </button>
            </div>

            {/* Content Container to take up available space above BottomNav */}
            <div className="flex-1 flex flex-col justify-end pb-[calc(var(--nav-height)+var(--safe-bottom))] px-[24px]">
                
                {/* 2. ALBUM ART */}
                <div className="w-full aspect-square mt-[20px] relative shrink-0 max-h-[400px] mx-auto">
                    {currentSong?.youtube_id && !dataSaver ? (
                        <div className="w-full h-full rounded-[var(--r-xl)] overflow-hidden shadow-[0_10px_40px_var(--accent-glow)] relative">
                            <img 
                                src={imgError ? `https://img.youtube.com/vi/${currentSong.youtube_id}/hqdefault.jpg` : `https://img.youtube.com/vi/${currentSong.youtube_id}/maxresdefault.jpg`}
                                onError={() => setImgError(true)}
                                alt="Album Art" 
                                className="w-full h-full object-cover"
                            />
                        </div>
                    ) : (
                        <div className="w-full h-full rounded-[var(--r-xl)] bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center shadow-[0_10px_40px_var(--accent-glow)]">
                             <svg className="w-16 h-16 text-[var(--text-faint)]" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                            </svg>
                        </div>
                    )}
                </div>

                {/* 3. TRACK INFO */}
                <div className="flex items-center justify-between mt-[32px]">
                    <div className="flex-1 flex flex-col min-w-0 pr-4">
                        <h2 className="text-[18px] font-[700] text-[var(--text-primary)] truncate">
                            {currentSong?.title || 'Unknown Title'}
                        </h2>
                        <p className="text-[13px] text-[var(--text-secondary)] truncate mt-[4px]">
                            {currentSong?.artist || 'Unknown Artist'}
                        </p>
                    </div>
                    <button onClick={onGoToPlaylist} className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                    </button>
                </div>

                {/* 4. PROGRESS BAR */}
                <div className="mt-[24px]">
                    <div className="relative w-full h-[3px] bg-[var(--surface-3)] rounded-full flex items-center">
                        <input 
                            type="range"
                            min="0"
                            max={currentDuration || 100}
                            value={progress || 0}
                            readOnly
                            className="absolute z-10 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div 
                            className="absolute left-0 h-full rounded-full bg-[var(--accent)] pointer-events-none" 
                            style={{ width: `${currentDuration > 0 ? (progress / currentDuration) * 100 : 0}%` }} 
                        />
                        <div 
                            className="absolute w-[10px] h-[10px] rounded-full bg-white transform -translate-x-1/2 pointer-events-none shadow-md"
                            style={{ left: `${currentDuration > 0 ? (progress / currentDuration) * 100 : 0}%` }}
                        />
                    </div>
                    <div className="flex justify-between mt-[8px] text-[11px] font-mono text-[var(--text-faint)]">
                        <span>{formatDuration(progress)}</span>
                        <span>{formatDuration(currentDuration)}</span>
                    </div>
                </div>

                {/* 5. CONTROLS */}
                <div className="flex items-center justify-between px-[8px] mt-[32px] mb-[24px]">
                    <button className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-2 active:scale-95">
                        <svg className="w-[20px] h-[20px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h7l4 8-4 8H4M17 4h3M17 20h3M20 4l-3 3m3-3l-3-3M20 20l-3-3m3 3l-3 3" />
                        </svg>
                    </button>
                    <button onClick={onPrev} className="text-[var(--text-primary)] transition-colors p-2 active:scale-95">
                        <svg className="w-[24px] h-[24px]" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                        </svg>
                    </button>
                    
                    <motion.button
                        onClick={onPlayPause}
                        className="w-[64px] h-[64px] rounded-full flex items-center justify-center bg-[var(--accent)] shadow-lg"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        {isPlaying ? (
                            <svg className="w-[24px] h-[24px] text-black" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                            </svg>
                        ) : (
                            <svg className="w-[24px] h-[24px] text-black ml-1" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        )}
                    </motion.button>

                    <button onClick={onNext} className="text-[var(--text-primary)] transition-colors p-2 active:scale-95">
                        <svg className="w-[24px] h-[24px]" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                        </svg>
                    </button>
                    <button className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-2 active:scale-95">
                        <svg className="w-[20px] h-[20px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>

                {/* 6. BOTTOM ACTIONS */}
                <div className="flex items-center justify-center gap-4 mt-auto mb-[16px]">
                    {currentSong?.youtube_id && (
                        <motion.a
                            href={`https://www.youtube.com/watch?v=${currentSong.youtube_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 rounded-full border border-[var(--border)] flex items-center gap-2 transition-colors hover:bg-[var(--surface-raised)] bg-[var(--surface-2)]"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
                            </svg>
                            <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Source</span>
                        </motion.a>
                    )}
                    {isMuted && currentSong?.youtube_id && (
                        <button onClick={onUnmute}
                            className="px-4 py-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-raised)] transition-colors flex items-center gap-2">
                            <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                            </svg>
                            <span className="text-[11px] font-bold text-[var(--text-primary)] uppercase tracking-wider">Unmute</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Bottom Nav */}
            <div className="absolute bottom-0 left-0 right-0 z-40">
                <BottomNav
                    active={activeNav}
                    onNav={(nav) => {
                        if (nav === 'home') onNavHome();
                        if (nav === 'search') onNavSearch();
                        if (nav === 'timeline') onNavTimeline();
                    }}
                    moodColor={moodColor}
                    onPlaylist={onPlaylist}
                    onSettings={onSettings}
                    playlistOpen={showPlaylistManager}
                    settingsOpen={showSettings}
                    playlistCount={playlistCount}
                />
            </div>
        </motion.div>
    );
}
