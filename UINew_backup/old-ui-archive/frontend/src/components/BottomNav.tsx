'use client';

import { useTransition } from 'react';

interface BottomNavProps {
    active: string;
    onNav: (nav: 'home' | 'search' | 'timeline') => void;
    moodColor: string; // Kept for prop compatibility, though we use var(--accent) now
    onPlaylist: () => void;
    onSettings: () => void;
    playlistOpen?: boolean;
    settingsOpen?: boolean;
    playlistCount?: number;
}

export default function BottomNav({
    active,
    onNav,
    onPlaylist,
    onSettings,
    playlistOpen,
    settingsOpen,
    playlistCount,
}: BottomNavProps) {
    const [isPending, startNavTransition] = useTransition();
    
    // We update the icons to 24px as specified
    const items = [
        {
            id: 'home' as const,
            icon: (
                <svg className="w-[24px] h-[24px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
            ),
        },
        {
            id: 'search' as const,
            icon: (
                <svg className="w-[24px] h-[24px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            ),
        },
        {
            id: 'timeline' as const,
            icon: (
                <svg className="w-[24px] h-[24px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
            ),
        },
    ];

    const anyDrawerOpen = playlistOpen || settingsOpen;

    return (
        <div 
            className="w-full flex items-center justify-around z-50 transition-all"
            style={{
                height: 'calc(var(--nav-height) + var(--safe-bottom))',
                paddingBottom: 'var(--safe-bottom)',
                background: 'rgba(14, 14, 16, 0.85)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderTop: '1px solid var(--divider)',
            }}
        >
            {items.map(item => {
                const isActive = active === item.id && !anyDrawerOpen;
                return (
                    <button
                        key={item.id}
                        id={`nav-${item.id}-btn`}
                        onClick={() => startNavTransition(() => onNav(item.id))}
                        disabled={isPending}
                        className="relative flex flex-col items-center justify-center w-[48px] h-[48px]"
                    >
                        {isActive && (
                            <div 
                                className="absolute top-[4px] w-[4px] h-[4px] rounded-full"
                                style={{ background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-glow)' }}
                            />
                        )}
                        <div className={`transition-colors mt-[4px] ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                            {item.icon}
                        </div>
                    </button>
                );
            })}

            {/* Library / Playlist Button */}
            <button
                onClick={onPlaylist}
                className="relative flex flex-col items-center justify-center w-[48px] h-[48px]"
            >
                {playlistOpen && (
                    <div 
                        className="absolute top-[4px] w-[4px] h-[4px] rounded-full"
                        style={{ background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-glow)' }}
                    />
                )}
                <div className={`transition-colors mt-[4px] relative ${playlistOpen ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                    <svg className="w-[24px] h-[24px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    {(playlistCount ?? 0) > 0 && !playlistOpen && (
                        <span
                            className="absolute -top-[4px] -right-[4px] min-w-[14px] h-[14px] flex items-center justify-center rounded-full text-[8px] font-bold text-[#000]"
                            style={{ background: 'var(--accent)' }}
                        >
                            {playlistCount}
                        </span>
                    )}
                </div>
            </button>

            {/* Settings Button */}
            <button
                onClick={onSettings}
                className="relative flex flex-col items-center justify-center w-[48px] h-[48px]"
            >
                {settingsOpen && (
                    <div 
                        className="absolute top-[4px] w-[4px] h-[4px] rounded-full"
                        style={{ background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-glow)' }}
                    />
                )}
                <div className={`transition-colors mt-[4px] ${settingsOpen ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                    <svg className="w-[24px] h-[24px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </div>
            </button>
        </div>
    );
}
