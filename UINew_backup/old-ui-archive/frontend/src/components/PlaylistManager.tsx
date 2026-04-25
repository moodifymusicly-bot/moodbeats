'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RecommendedSong } from '@/lib/types';

export interface Playlist {
    id: string;
    name: string;
    songs: RecommendedSong[];
    createdAt: string;
}

interface PlaylistManagerProps {
    isOpen: boolean;
    onClose: () => void;
    playlists: Playlist[];
    onCreatePlaylist: (name: string) => void;
    onDeletePlaylist: (id: string) => void;
    onPlayPlaylist: (playlist: Playlist) => void;
    onRemoveSong: (playlistId: string, songId: string) => void;
}

export default function PlaylistManager({
    isOpen,
    onClose,
    playlists,
    onCreatePlaylist,
    onDeletePlaylist,
    onPlayPlaylist,
    onRemoveSong,
}: PlaylistManagerProps) {
    const [newName, setNewName] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const handleCreate = () => {
        const name = newName.trim();
        if (!name) return;
        onCreatePlaylist(name);
        setNewName('');
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />

                    {/* Panel */}
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
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                            <h2 className="text-sm font-black tracking-[0.2em] uppercase text-white/80">
                                My Playlists
                            </h2>
                            <button
                                onClick={onClose}
                                className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white/80 transition-all"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Create new playlist */}
                        <div className="px-5 py-3 border-b border-white/5">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="New playlist name..."
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/25 focus:outline-none focus:border-purple-500/50 transition-colors"
                                />
                                <motion.button
                                    onClick={handleCreate}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    disabled={!newName.trim()}
                                    className="px-4 py-2 rounded-lg text-[10px] font-bold tracking-wider uppercase disabled:opacity-30 transition-all"
                                    style={{
                                        background: 'linear-gradient(135deg, #9333ea, #6366f1)',
                                        color: '#fff',
                                    }}
                                >
                                    Create
                                </motion.button>
                            </div>
                        </div>

                        {/* Playlist list */}
                        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                            {playlists.length === 0 ? (
                                <div className="text-center py-16">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/10 to-indigo-600/10 border border-purple-500/10 flex items-center justify-center text-3xl mx-auto mb-4">
                                        🎵
                                    </div>
                                    <p className="text-sm text-white/40 font-medium">No playlists yet</p>
                                    <p className="text-[11px] text-white/20 mt-1.5 max-w-[200px] mx-auto leading-relaxed">Create a playlist above, then add songs while browsing</p>
                                </div>
                            ) : (
                                playlists.map((pl) => (
                                    <motion.div
                                        key={pl.id}
                                        layout
                                        className="rounded-xl overflow-hidden"
                                        style={{
                                            background: 'rgba(255,255,255,0.03)',
                                            border: '1px solid rgba(255,255,255,0.06)',
                                        }}
                                    >
                                        {/* Playlist header */}
                                        <div
                                            className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/3 transition-colors"
                                            onClick={() => setExpandedId(expandedId === pl.id ? null : pl.id)}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500/30 to-indigo-600/30 flex items-center justify-center flex-shrink-0">
                                                    <span className="text-sm">🎶</span>
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-white/80 truncate">{pl.name}</p>
                                                    <p className="text-[9px] text-white/30">{pl.songs.length} song{pl.songs.length !== 1 ? 's' : ''}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                {pl.songs.length > 0 && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onPlayPlaylist(pl); }}
                                                        className="p-1.5 rounded-lg hover:bg-green-500/10 text-green-400 transition-all"
                                                    >
                                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                                            <path d="M8 5v14l11-7z" />
                                                        </svg>
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onDeletePlaylist(pl.id); }}
                                                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400/50 hover:text-red-400 transition-all"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                                <svg
                                                    className={`w-4 h-4 text-white/20 transition-transform ${expandedId === pl.id ? 'rotate-180' : ''}`}
                                                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </div>
                                        </div>

                                        {/* Expanded song list */}
                                        <AnimatePresence>
                                            {expandedId === pl.id && pl.songs.length > 0 && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.2 }}
                                                    className="border-t border-white/5 overflow-hidden"
                                                >
                                                    {pl.songs.map((song, idx) => (
                                                        <div
                                                            key={song.id}
                                                            className="flex items-center justify-between px-4 py-2 hover:bg-white/3 transition-colors"
                                                        >
                                                            <div className="flex items-center gap-2.5 min-w-0">
                                                                <span className="text-[9px] text-white/20 w-4 text-right font-mono">{idx + 1}</span>
                                                                {song.cover_url && (
                                                                    <img src={song.cover_url} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
                                                                )}
                                                                <div className="min-w-0">
                                                                    <p className="text-[10px] font-bold text-white/70 truncate">{song.title}</p>
                                                                    <p className="text-[9px] text-white/30 truncate">{song.artist}</p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => onRemoveSong(pl.id, song.id)}
                                                                className="p-1 text-white/15 hover:text-red-400 transition-colors flex-shrink-0"
                                                            >
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                ))
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

// Add-to-playlist popover for use inside SongCard / NowPlaying
interface AddToPlaylistPopoverProps {
    song: RecommendedSong;
    playlists: Playlist[];
    onAddToPlaylist: (playlistId: string, song: RecommendedSong) => void;
    onClose: () => void;
}

export function AddToPlaylistPopover({ song, playlists, onAddToPlaylist, onClose }: AddToPlaylistPopoverProps) {
    return (
        <>
            <div className="fixed inset-0 z-40" onClick={onClose} />
            <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                className="absolute bottom-full right-0 mb-2 z-50 w-48 rounded-xl overflow-hidden"
                style={{
                    background: 'rgba(20,20,30,0.95)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                }}
            >
                <div className="px-3 py-2 border-b border-white/5">
                    <p className="text-[9px] tracking-[0.15em] uppercase text-white/30 font-bold">Add to Playlist</p>
                </div>
                {playlists.length === 0 ? (
                    <div className="px-3 py-3 text-center">
                        <p className="text-[10px] text-white/25">No playlists. Create one first.</p>
                    </div>
                ) : (
                    playlists.map((pl) => {
                        const alreadyIn = pl.songs.some(s => s.id === song.id);
                        return (
                            <button
                                key={pl.id}
                                onClick={() => { if (!alreadyIn) onAddToPlaylist(pl.id, song); onClose(); }}
                                disabled={alreadyIn}
                                className={`w-full px-3 py-2 text-left text-[10px] font-bold transition-colors flex items-center gap-2 ${alreadyIn ? 'text-white/15 cursor-not-allowed' : 'text-white/60 hover:bg-white/5 hover:text-white/80'}`}
                            >
                                <span>🎶</span>
                                <span className="truncate">{pl.name}</span>
                                {alreadyIn && <span className="text-[8px] text-green-400/50 ml-auto">✓</span>}
                            </button>
                        );
                    })
                )}
            </motion.div>
        </>
    );
}
