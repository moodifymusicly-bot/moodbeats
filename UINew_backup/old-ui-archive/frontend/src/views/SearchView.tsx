'use client';

import { motion } from 'framer-motion';
import BottomNav from '@/components/BottomNav';
import MiniPlayer from '@/components/MiniPlayer';
import { RecommendedSong } from '@/lib/types';

interface SearchViewProps {
    searchQuery: string;
    onSearchQueryChange: (q: string) => void;
    youtubeResults: RecommendedSong[];
    isSearching: boolean;
    moodColor: string;
    onSongPlay: (song: RecommendedSong) => void;
    // Nav
    onNavHome: () => void;
    onNavSearch: () => void;
    onNavTimeline: () => void;
    onPlaylist: () => void;
    onSettings: () => void;
    showPlaylistManager: boolean;
    showSettings: boolean;
    playlistCount: number;
    // Mini player
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

export default function SearchView(props: SearchViewProps) {
    const {
        searchQuery, onSearchQueryChange, youtubeResults, isSearching, moodColor,
        onSongPlay,
        onNavHome, onNavSearch, onNavTimeline,
        onPlaylist, onSettings, showPlaylistManager, showSettings, playlistCount,
        currentSong, isPlaying, progress, duration,
        onExpandPlayer, onPlayPause, onPrev, onNext, onClosePlayer,
    } = props;

    return (
        <motion.div
            key="search"
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
                    Search YouTube
                </h1>
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
                        onChange={(e) => onSearchQueryChange(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-4 text-sm text-white placeholder-white/40 focus:outline-none focus:border-purple-500 focus:bg-white/10 transition-all font-display tracking-wide"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => onSearchQueryChange('')}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                <div className={`mt-6 space-y-1 overflow-y-auto flex-1`}>
                    {/* Empty state */}
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

                    {/* Skeleton loading */}
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

                    {/* No results */}
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

                    {/* Results */}
                    {youtubeResults.map((song) => (
                        <motion.button
                            key={song.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            onClick={() => onSongPlay(song)}
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
                    active="search"
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
