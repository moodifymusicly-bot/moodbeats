'use client';

import { motion } from 'framer-motion';
import { MoodType, MOOD_CONFIG, User } from '@/lib/types';

interface NavBarProps {
    user: User | null;
    onAuthClick: () => void;
    onLogout: () => void;
    currentMood: MoodType | null;
}

export default function NavBar({ user, onAuthClick, onLogout, currentMood }: NavBarProps) {
    const moodColor = currentMood ? MOOD_CONFIG[currentMood].color : '#3b82f6';

    return (
        <motion.nav
            className="fixed top-0 left-0 right-0 z-30 backdrop-blur-xl border-b border-white/5"
            style={{ background: 'rgba(3, 3, 3, 0.8)' }}
            initial={{ y: -80 }}
            animate={{ y: 0 }}
            transition={{ delay: 0.1, type: 'spring', damping: 25 }}
        >
            <div className="max-w-5xl mx-auto flex items-center justify-between h-16 px-4 sm:px-6">
                {/* Logo */}
                <div className="flex items-center gap-3">
                    <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center font-display font-black text-sm"
                        style={{
                            background: `linear-gradient(135deg, ${moodColor}, ${moodColor}80)`,
                        }}
                    >
                        M
                    </div>
                    <div>
                        <h1 className="font-display text-sm font-bold tracking-wider uppercase">
                            MoodMusic
                        </h1>
                        <div className="flex items-center gap-1.5">
                            <span
                                className="w-1 h-1 rounded-full animate-pulse"
                                style={{ backgroundColor: moodColor }}
                            />
                            <span className="text-[9px] tracking-[0.2em] uppercase" style={{ color: moodColor }}>
                                AI Engine
                            </span>
                        </div>
                    </div>
                </div>

                {/* Right side */}
                <div className="flex items-center gap-3">
                    {currentMood && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs"
                            style={{
                                backgroundColor: moodColor + '15',
                                color: moodColor,
                                border: `1px solid ${moodColor}30`,
                            }}
                        >
                            <span>{MOOD_CONFIG[currentMood].emoji}</span>
                            <span className="font-medium">{MOOD_CONFIG[currentMood].label}</span>
                        </motion.div>
                    )}

                    {user ? (
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold uppercase">
                                {user.username[0]}
                            </div>
                            <button
                                onClick={onLogout}
                                className="text-xs text-white/40 hover:text-white/60 transition-colors hidden sm:block"
                            >
                                Logout
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={onAuthClick}
                            className="px-4 py-1.5 rounded-full text-xs font-semibold glass glass-hover transition-all hover:scale-105"
                        >
                            Sign In
                        </button>
                    )}
                </div>
            </div>
        </motion.nav>
    );
}
