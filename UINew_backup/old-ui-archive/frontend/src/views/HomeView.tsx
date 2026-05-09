'use client';

import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import BottomNav from '@/components/BottomNav';
import MiniPlayer from '@/components/MiniPlayer';
import SongCard from '@/components/SongCard';
import UserMenu from '@/components/UserMenu';
import { MoodType, MOOD_CONFIG, RecommendedSong } from '@/lib/types';
import { HomeFeedData, DiscoverFeedData, cardAccentMood } from '@/lib/appState';

const FaceCamera = dynamic(() => import('@/components/FaceCamera'), { ssr: false });

interface HomeViewProps {
    // Auth
    isSignedIn: boolean;
    userName: string | null;
    userImage: string | null;
    onSignIn: () => void;
    onSignOut: () => void;
    // Mood
    selectedMood: MoodType | null;
    moodColor: string;
    detectedConfidence: number;
    cameraActive: boolean;
    isDetecting: boolean;
    moodRecLoading: boolean;
    onMoodSelect: (mood: MoodType) => void;
    onCameraStart: () => void;
    onCameraStop: () => void;
    onDetectStart: () => void;
    onDetectStop: () => void;
    onCameraMood: (mood: MoodType, conf: number) => void;
    // Songs
    songs: RecommendedSong[];
    artistFilter: string;
    onArtistFilterChange: (v: string) => void;
    onSongPlay: (song: RecommendedSong) => void;
    onLikeSong: (id: string, song: RecommendedSong) => void;
    likedSongs: Set<string>;
    onAddToPlaylist: (song: RecommendedSong) => void;
    // Feeds
    homeFeed: HomeFeedData | null;
    homeFeedLoading: boolean;
    discoverFeed: DiscoverFeedData | null;
    discoverLoading: boolean;
    recentlyPlayedLocal: RecommendedSong[];
    // Player
    currentSong: RecommendedSong | null;
    isPlaying: boolean;
    progress: number;
    duration: number;
    // Nav
    activeNav: string;
    onNavHome: () => void;
    onNavSearch: () => void;
    onNavTimeline: () => void;
    onNavLanding: () => void;
    onResetHome: () => void;
    onExpandPlayer: () => void;
    onPlayPause: () => void;
    onPrev: () => void;
    onNext: () => void;
    onClosePlayer: () => void;
    onPlaylist: () => void;
    onSettings: () => void;
    showPlaylistManager: boolean;
    showSettings: boolean;
    playlistCount: number;
}

export default function HomeView(props: HomeViewProps) {
    const {
        isSignedIn, userName, userImage, onSignIn, onSignOut,
        selectedMood, moodColor, detectedConfidence,
        cameraActive, isDetecting, moodRecLoading,
        onMoodSelect, onCameraStart, onCameraStop, onDetectStart, onDetectStop, onCameraMood,
        songs, artistFilter, onArtistFilterChange,
        onSongPlay, onLikeSong, likedSongs, onAddToPlaylist,
        homeFeed, homeFeedLoading, discoverFeed, discoverLoading,
        recentlyPlayedLocal,
        currentSong, isPlaying, progress, duration,
        activeNav,
        onNavHome, onNavSearch, onNavTimeline, onNavLanding, onResetHome,
        onExpandPlayer, onPlayPause, onPrev, onNext, onClosePlayer,
        onPlaylist, onSettings, showPlaylistManager, showSettings, playlistCount,
    } = props;

    const compactDetectedMood = Boolean(selectedMood && (songs.length > 0 || moodRecLoading));

    // BUG FIX: Show feeds even when a mood is selected but songs are empty (prevents blank screen).
    const showFeeds = !moodRecLoading && (songs.length === 0);

    return (
        <motion.div
            key="home"
            className="relative z-10 flex flex-col min-h-[100dvh] pb-[var(--nav-height)] overflow-x-hidden justify-start"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -50 }}
        >
            {/* Top bar */}
            <div className="flex items-center justify-between px-[16px] pt-[16px] pb-[8px]">
                <button
                    onClick={onNavLanding}
                    className="text-[13px] font-[600] tracking-[3px] text-[var(--text-secondary)] uppercase hover:text-[var(--text-primary)] transition-colors"
                >
                    MOODBEATZ
                </button>
                <div className="w-[32px] h-[32px] rounded-full border-[1.5px] border-[var(--border)] overflow-hidden shrink-0 flex items-center justify-center">
                    <UserMenu
                        isSignedIn={isSignedIn}
                        userName={userName}
                        userImage={userImage}
                        onSignIn={onSignIn}
                        onSignOut={onSignOut}
                    />
                </div>
            </div>

            {/* Mood Detection Section */}
            <div className="px-[16px] mt-[8px]">
                <div 
                    className="w-full rounded-[var(--r-lg)] p-[16px] flex items-center justify-between mb-[12px]"
                    style={{
                        background: 'linear-gradient(135deg, #0e2a35 0%, #0a1a20 100%)',
                        border: '1px solid rgba(0, 212, 255, 0.2)'
                    }}
                >
                    <div className="flex flex-col">
                        <h2 className="text-[15px] font-[600] text-[var(--text-primary)]">
                            Detect Your Mood
                        </h2>
                        <p className="text-[12px] text-[var(--text-secondary)] mt-[2px]">
                            {selectedMood ? `Current: ${MOOD_CONFIG[selectedMood].label}` : 'AI expression analysis'}
                        </p>
                    </div>
                    <button
                        onClick={cameraActive ? onCameraStop : onCameraStart}
                        className="px-[16px] py-[8px] bg-[var(--accent)] text-[#000] rounded-full text-[12px] font-[600] active:scale-95 transition-transform"
                    >
                        {cameraActive || isDetecting ? 'STOP' : 'START'}
                    </button>
                </div>

                <AnimatePresence>
                    {cameraActive && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden mb-[16px]"
                        >
                            <FaceCamera
                                onMoodDetected={onCameraMood}
                                isActive={cameraActive}
                                isDetecting={isDetecting}
                                onStartDetect={onDetectStart}
                                onStopDetect={onDetectStop}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Horizontal scrollable mood chips */}
                <div className="flex gap-[8px] overflow-x-auto pb-[4px] pr-[20px]" style={{ scrollbarWidth: 'none' }}>
                    {(['happy', 'sad', 'gym', 'study', 'rock'] as MoodType[]).map((mood) => {
                        const isSelected = selectedMood === mood;
                        return (
                            <button
                                key={mood}
                                onClick={() => onMoodSelect(mood)}
                                className={`h-[30px] px-[12px] rounded-[var(--r-full)] text-[12px] flex items-center justify-center whitespace-nowrap shrink-0 transition-colors ${
                                    isSelected 
                                        ? 'bg-[var(--accent-dim)] border border-[var(--accent)] text-[var(--accent)]' 
                                        : 'bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                }`}
                            >
                                {MOOD_CONFIG[mood].emoji} {MOOD_CONFIG[mood].label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {moodRecLoading && (
                <div className="flex items-center justify-center gap-3 py-3 mt-2">
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
                    <p className="text-[10px] tracking-[0.35em] uppercase text-white/40 font-semibold">
                        Loading
                    </p>
                </div>
            )}

            {/* BUG FIX: Empty state when mood is selected but no songs loaded */}
            {selectedMood && !moodRecLoading && songs.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 px-5">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                        style={{ background: `${moodColor}15`, border: `1px solid ${moodColor}25` }}>
                        <span className="text-2xl">{MOOD_CONFIG[selectedMood].emoji}</span>
                    </div>
                    <p className="text-sm text-white/50 font-semibold text-center">
                        No tracks found for {MOOD_CONFIG[selectedMood].label}
                    </p>
                    <p className="text-xs text-white/25 mt-1 text-center max-w-[260px]">
                        Try another mood or use the search to find specific songs
                    </p>
                    <button
                        onClick={onResetHome}
                        className="mt-4 px-5 py-2 rounded-full text-[10px] tracking-[0.2em] uppercase font-bold border border-white/15 text-white/50 hover:text-white/80 hover:border-white/30 transition-all"
                    >
                        Browse All
                    </button>
                </div>
            )}

            {/* Recently Played (anonymous) */}
            {showFeeds && !isSignedIn && recentlyPlayedLocal.length > 0 && (
                <FeedSection title="Recently Played" subtitle="Pick up where you left off" icon="🕐"
                    songs={recentlyPlayedLocal} keyPrefix="recent-local"
                    selectedMood={selectedMood} moodColor={moodColor}
                    currentSong={currentSong} isPlaying={isPlaying}
                    likedSongs={likedSongs}
                    onSongPlay={onSongPlay} onLikeSong={onLikeSong} onAddToPlaylist={onAddToPlaylist}
                />
            )}

            {/* Discover Feed (all users) */}
            {showFeeds && (discoverLoading || discoverFeed) && (
                <div className="px-5 sm:px-8 lg:px-12 xl:px-20 mt-5 space-y-5">
                    {discoverLoading && !discoverFeed && (
                        <div className="flex items-center justify-center gap-3 py-4">
                            <div className="w-6 h-6 border-2 border-white/20 border-t-purple-400/70 rounded-full animate-spin" />
                            <p className="text-xs tracking-widest uppercase text-white/40 font-semibold">Loading recommendations...</p>
                        </div>
                    )}
                    {discoverFeed && [
                        { title: 'Fresh Picks', subtitle: 'New & trending music for you', icon: '✨', songs: discoverFeed.fresh_picks, accent: '#a78bfa' },
                        { title: 'Timeless Classics', subtitle: 'Legendary tracks that never get old', icon: '💎', songs: discoverFeed.timeless_classics, accent: '#fbbf24' },
                        { title: 'Trending Now', subtitle: 'What everyone is listening to', icon: '🔥', songs: discoverFeed.trending, accent: '#f97316' },
                    ]
                        .filter((sec) => sec.songs.length > 0)
                        .map((section) => (
                            <FeedSection key={section.title} title={section.title} subtitle={section.subtitle} icon={section.icon}
                                songs={section.songs} keyPrefix={`discover-${section.title}`}
                                selectedMood={selectedMood} moodColor={moodColor}
                                currentSong={currentSong} isPlaying={isPlaying}
                                likedSongs={likedSongs}
                                onSongPlay={onSongPlay} onLikeSong={onLikeSong} onAddToPlaylist={onAddToPlaylist}
                            />
                        ))}
                </div>
            )}

            {/* Personalized Home Feed (signed-in) */}
            {showFeeds && isSignedIn && (homeFeedLoading || homeFeed) && (
                <div className="px-5 sm:px-8 lg:px-12 xl:px-20 mt-5 space-y-5">
                    {homeFeedLoading && !homeFeed && (
                        <div className="flex items-center justify-center gap-3 py-3">
                            <div className="w-5 h-5 border-2 border-white/20 border-t-white/50 rounded-full animate-spin" />
                            <p className="text-xs tracking-widest uppercase text-white/40 font-semibold">Personalizing...</p>
                        </div>
                    )}
                    {homeFeed && [
                        { title: 'Recommended for You', subtitle: 'Based on your listening history', icon: '🎯', songs: homeFeed.for_you },
                        { title: 'Recently Played', subtitle: 'Pick up where you left off', icon: '🕐', songs: homeFeed.last_played },
                        { title: 'Your Most Played', subtitle: 'Your all-time favorites', icon: '🏆', songs: homeFeed.most_played },
                        ...(homeFeed.cold_start && homeFeed.mood_starter.length > 0
                            ? [{ title: 'Starter Picks', subtitle: 'Get started with these curated tracks', icon: '🌱', songs: homeFeed.mood_starter }]
                            : []),
                    ]
                        .filter((sec) => sec.songs.length > 0)
                        .map((section) => (
                            <FeedSection key={section.title} title={section.title} subtitle={section.subtitle} icon={section.icon}
                                songs={section.songs} keyPrefix={`home-${section.title}`}
                                selectedMood={selectedMood} moodColor={moodColor}
                                currentSong={currentSong} isPlaying={isPlaying}
                                likedSongs={likedSongs}
                                onSongPlay={onSongPlay} onLikeSong={onLikeSong} onAddToPlaylist={onAddToPlaylist}
                            />
                        ))}
                </div>
            )}

            {/* Artist Filter */}
            {songs.length > 0 && (
                <div className="px-5 sm:px-8 lg:px-12 xl:px-20 mt-4">
                    <div className="relative max-w-2xl mx-auto">
                        <input
                            type="text"
                            placeholder="Filter by Artist..."
                            value={artistFilter}
                            onChange={(e) => onArtistFilterChange(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/25 focus:outline-none focus:border-white/25 focus:bg-white/8 transition-all font-display tracking-widest uppercase text-center"
                        />
                        {artistFilter && (
                            <button onClick={() => onArtistFilterChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/30 hover:text-white/70">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Song List */}
            {songs.length > 0 && (
                <div className="px-[16px] mt-[24px]">
                    <div className="flex items-center justify-between mb-[12px]">
                        <h3 className="text-[15px] font-[600] text-[var(--text-primary)]">
                            Most Wanted Tracks
                        </h3>
                        <span className="text-[12px] text-[var(--accent)]">
                            Neural Sync
                        </span>
                    </div>

                    <div className="flex gap-[12px] overflow-x-auto py-[4px] pr-[20px]" style={{ scrollbarWidth: 'none' }}>
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
                                    onPlay={() => onSongPlay(song)}
                                    onLike={() => onLikeSong(song.id, song)}
                                    isLiked={likedSongs.has(song.id)}
                                    onAddToPlaylist={() => onAddToPlaylist(song)}
                                />
                            ))}
                    </div>
                </div>
            )}

            {/* Bottom Nav */}
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
                    active={activeNav}
                    onNav={(nav) => {
                        if (nav === 'search') onNavSearch();
                        if (nav === 'home') onNavHome();
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

// ===== REUSABLE FEED SECTION =====
function FeedSection({ title, subtitle, icon, songs, keyPrefix, selectedMood, moodColor, currentSong, isPlaying, likedSongs, onSongPlay, onLikeSong, onAddToPlaylist }: {
    title: string;
    subtitle: string;
    icon: string;
    songs: RecommendedSong[];
    keyPrefix: string;
    selectedMood: MoodType | null;
    moodColor: string;
    currentSong: RecommendedSong | null;
    isPlaying: boolean;
    likedSongs: Set<string>;
    onSongPlay: (song: RecommendedSong) => void;
    onLikeSong: (id: string, song: RecommendedSong) => void;
    onAddToPlaylist: (song: RecommendedSong) => void;
}) {
    return (
        <div className="px-[16px] mt-[24px]">
            <div className="flex items-center justify-between mb-[12px]">
                <div className="flex flex-col">
                    <h3 className="text-[15px] font-[600] text-[var(--text-primary)] flex items-center gap-[6px]">
                        {icon} {title}
                    </h3>
                    <p className="text-[12px] text-[var(--text-secondary)] mt-[2px]">{subtitle}</p>
                </div>
                <button className="text-[var(--accent)] text-[12px] hover:opacity-80 transition-opacity">
                    See all &rarr;
                </button>
            </div>
            <div className="flex gap-[12px] overflow-x-auto py-[4px] pr-[20px]" style={{ scrollbarWidth: 'none' }}>
                {songs.map((song, i) => (
                    <SongCard
                        key={`${keyPrefix}-${song.id}-${i}`}
                        song={song}
                        index={i}
                        mood={selectedMood!}
                        isActive={currentSong?.id === song.id}
                        isPlaying={isPlaying && currentSong?.id === song.id}
                        onPlay={() => onSongPlay(song)}
                        onLike={() => onLikeSong(song.id, song)}
                        isLiked={likedSongs.has(song.id)}
                        onAddToPlaylist={() => onAddToPlaylist(song)}
                    />
                ))}
            </div>
        </div>
    );
}
