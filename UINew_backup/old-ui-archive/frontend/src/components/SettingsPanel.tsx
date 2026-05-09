'use client';

import { motion, AnimatePresence } from 'framer-motion';

// ===== SETTINGS PANEL =====
interface SettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    moodColor: string;
    dataSaver: boolean;
    onDataSaver: (v: boolean) => void;
    bgEffects: boolean;
    onBgEffects: (v: boolean) => void;
    autoPlay: boolean;
    onAutoPlay: (v: boolean) => void;
}

export default function SettingsPanel({
    isOpen,
    onClose,
    moodColor,
    dataSaver,
    onDataSaver,
    bgEffects,
    onBgEffects,
    autoPlay,
    onAutoPlay,
}: SettingsPanelProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />
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
                        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                            <h2 className="text-sm font-black tracking-[0.2em] uppercase text-white/80">Settings</h2>
                            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white/80 transition-all">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
                            {/* Playback Section */}
                            <p className="text-[9px] tracking-[0.2em] uppercase text-white/25 font-bold mb-3 mt-1">Playback</p>

                            <SettingRow
                                label="Data Saver"
                                description="Hides background video to reduce data usage"
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                                checked={dataSaver}
                                onChange={onDataSaver}
                                moodColor={moodColor}
                            />

                            <SettingRow
                                label="Auto-Play Next"
                                description="Automatically play the next song in queue"
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                                checked={autoPlay}
                                onChange={onAutoPlay}
                                moodColor={moodColor}
                            />

                            {/* Visual Section */}
                            <p className="text-[9px] tracking-[0.2em] uppercase text-white/25 font-bold mb-3 mt-5">Visuals</p>

                            <SettingRow
                                label="Background Effects"
                                description="Animated star particles and mood gradients"
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>}
                                checked={bgEffects}
                                onChange={onBgEffects}
                                moodColor={moodColor}
                            />

                            {/* About Section */}
                            <p className="text-[9px] tracking-[0.2em] uppercase text-white/25 font-bold mb-3 mt-5">About</p>
                            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                                <p className="text-xs text-white/50 font-semibold">MoodBeatz</p>
                                <p className="text-[10px] text-white/25 mt-1">AI-powered mood-based music discovery</p>
                                <p className="text-[10px] text-white/15 mt-0.5">v1.0.0</p>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

// ===== SETTING ROW =====
function SettingRow({ label, description, icon, checked, onChange, moodColor }: {
    label: string;
    description: string;
    icon: React.ReactNode;
    checked: boolean;
    onChange: (v: boolean) => void;
    moodColor: string;
}) {
    return (
        <button
            onClick={() => onChange(!checked)}
            className="w-full flex items-center gap-3 p-3 rounded-xl transition-all active:scale-[0.98]"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
        >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: checked ? `${moodColor}15` : 'rgba(255,255,255,0.04)', color: checked ? moodColor : 'rgba(255,255,255,0.3)' }}>
                {icon}
            </div>
            <div className="flex-1 text-left min-w-0">
                <p className="text-xs font-bold text-white/70">{label}</p>
                <p className="text-[10px] text-white/25 mt-0.5 leading-snug">{description}</p>
            </div>
            <div
                className="w-10 h-[22px] rounded-full flex-shrink-0 relative transition-colors duration-200 cursor-pointer"
                style={{ background: checked ? moodColor : 'rgba(255,255,255,0.08)' }}
            >
                <motion.div
                    className="absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-sm"
                    animate={{ left: checked ? '20px' : '3px' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
            </div>
        </button>
    );
}
