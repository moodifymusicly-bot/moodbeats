'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface UserMenuProps {
    isSignedIn: boolean;
    userName: string | null;
    userImage: string | null;
    onSignIn: () => void;
    onSignOut: () => void;
}

export default function UserMenu({ isSignedIn, userName, userImage, onSignIn, onSignOut }: UserMenuProps) {
    const [open, setOpen] = useState(false);

    if (!isSignedIn) {
        return (
            <motion.button
                onClick={onSignIn}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] tracking-[0.15em] uppercase font-bold transition-all"
                style={{
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(99,102,241,0.2))',
                    border: '1px solid rgba(139,92,246,0.3)',
                    color: 'rgba(196,181,253,0.9)',
                }}
            >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Sign In
            </motion.button>
        );
    }

    return (
        <div className="relative">
            <motion.button
                onClick={() => setOpen(!open)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 p-1 rounded-full transition-all"
            >
                {userImage ? (
                    <img src={userImage} alt="" className="w-7 h-7 rounded-full object-cover border border-white/20" />
                ) : (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white border border-white/20">
                        {(userName || '?')[0].toUpperCase()}
                    </div>
                )}
            </motion.button>

            <AnimatePresence>
                {open && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                        <motion.div
                            initial={{ opacity: 0, y: -8, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            className="absolute right-0 top-10 z-50 w-48 rounded-xl overflow-hidden"
                            style={{
                                background: 'rgba(20,20,30,0.95)',
                                backdropFilter: 'blur(20px)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                            }}
                        >
                            <div className="px-4 py-3 border-b border-white/5">
                                <p className="text-xs font-bold text-white/80 truncate">{userName}</p>
                                <p className="text-[9px] text-white/30 mt-0.5">MoodBeats Member</p>
                            </div>
                            <button
                                onClick={() => { onSignOut(); setOpen(false); }}
                                className="w-full px-4 py-2.5 text-left text-[10px] tracking-wider uppercase text-red-400 hover:bg-red-500/10 transition-colors font-bold flex items-center gap-2"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                                Sign Out
                            </button>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
