'use client';

import { motion } from 'framer-motion';
import TimelineView from '@/components/TimelineView';
import BottomNav from '@/components/BottomNav';
import MiniPlayer from '@/components/MiniPlayer';
import { MoodTimelineEntry } from '@/components/MoodTimeline';
import { RecommendedSong } from '@/lib/types';

interface TimelinePageViewProps {
    moodHistory: MoodTimelineEntry[];
    moodColor: string;
    onNavHome: () => void;
    onNavSearch: () => void;
    onNavTimeline: () => void;
    onPlaylist: () => void;
    onSettings: () => void;
    showPlaylistManager: boolean;
    showSettings: boolean;
    playlistCount: number;
    currentSong: RecommendedSong | null;
    isPlaying: boolean;
    progress: number;
    duration: number;
    onExpandPlayer: () => void;
    onPlayPause: () => void;
    onPrev: () => void;
    onNext: () => void;
    onClosePlayer: () => void;
}

export default function TimelinePageView(props: TimelinePageViewProps) {
    const {
        moodHistory, moodColor,
        onNavHome, onNavSearch, onNavTimeline,
        onPlaylist, onSettings, showPlaylistManager, showSettings, playlistCount,
        currentSong, isPlaying, progress, duration,
        onExpandPlayer, onPlayPause, onPrev, onNext, onClosePlayer,
    } = props;

    return (
        <motion.div
            key="timeline"
            className="relative z-10 flex flex-col min-h-[100dvh] pb-[var(--nav-height)] overflow-x-hidden w-full"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
        >
            <div className="relative flex items-center justify-between px-5 pt-4 pb-2">
                <button onClick={onNavHome} className="p-1">
                    <svg className="w-6 h-6 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <h1 className="absolute left-1/2 -translate-x-1/2 text-xs tracking-[0.3em] uppercase font-bold text-white/80">
                    Mood Timeline
                </h1>
                <div className="w-6" />
            </div>

            <TimelineView moodHistory={moodHistory} moodColor={moodColor} />

            <div className="fixed bottom-0 left-0 right-0 z-40 flex flex-col">
                {currentSong && (
                    <MiniPlayer
                        currentSong={currentSong}
                        isPlaying={isPlaying}
                        progress={progress}
                        duration={duration}
                        moodColor={moodColor}
                        onExpand={onExpandPlayer}
                        onPlayPause={onPlayPause}
                        onPrev={onPrev}
                        onNext={onNext}
                        onClose={onClosePlayer}
                    />
                )}
                <BottomNav
                    active="timeline"
                    onNav={(nav) => {
                        if (nav === 'home') onNavHome();
                        if (nav === 'search') onNavSearch();
                        if (nav === 'timeline') onNavTimeline();
                    }}
                    moodColor={moodColor || '#8b5cf6'}
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
