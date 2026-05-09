'use client';

import { motion } from 'framer-motion';

interface LandingViewProps {
    onEnter: () => void;
}

export default function LandingView({ onEnter }: LandingViewProps) {
    return (
        <motion.div
            key="landing"
            className="page-wrapper flex flex-col overflow-x-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, filter: 'blur(8px)' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
            {/* ===== SCREEN 1: SPLASH / ONBOARDING ===== */}
            <section className="relative flex flex-col items-center justify-center min-h-[100dvh] w-full px-[28px]">
                {/* Waveform SVG */}
                <div className="w-full flex justify-center mb-8">
                    <svg
                        className="waveform-anim"
                        width="200"
                        height="120"
                        viewBox="0 0 200 120"
                        style={{ opacity: 0.4, color: 'var(--accent)' }}
                    >
                        <path
                            d="M 0 60 Q 25 20 50 60 T 100 60 T 150 60 T 200 60"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                        />
                        <path
                            d="M 0 60 Q 25 80 50 60 T 100 60 T 150 60 T 200 60"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            style={{ opacity: 0.5 }}
                        />
                        <path
                            d="M 0 60 Q 25 40 50 60 T 100 60 T 150 60 T 200 60"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            style={{ opacity: 0.2 }}
                        />
                    </svg>
                </div>
                <style jsx>{`
                    .waveform-anim {
                        animation: pulse-wave 2s ease-in-out infinite alternate;
                        transform-origin: center;
                    }
                    @keyframes pulse-wave {
                        from { transform: scaleY(0.9); }
                        to { transform: scaleY(1.1); }
                    }
                `}</style>

                {/* Title */}
                <h1
                    className="font-bold text-[32px] tracking-[-0.5px] text-[var(--text-primary)] text-center relative mb-4"
                >
                    MoodBeatz
                    <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-[40px] h-[3px] rounded-full bg-[var(--accent)]" />
                </h1>

                {/* Subtitle */}
                <p className="text-[15px] text-[var(--text-secondary)] text-center mb-10 max-w-[280px]">
                    Music that feels what you feel.
                </p>

                {/* Integration Pills */}
                <div className="flex flex-col items-center gap-4 mb-12 w-full max-w-[280px]">
                    <div className="flex items-center justify-center gap-[4px] px-[16px] py-[10px] rounded-[var(--r-full)] bg-[var(--surface-2)] border-[1px] border-[var(--border)] text-[13px] text-[var(--text-primary)]">
                        <svg className="w-[16px] h-[16px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        AI Face Detect
                    </div>
                    <div className="flex gap-3 justify-center w-full">
                        <div className="flex items-center justify-center gap-[4px] px-[16px] py-[10px] rounded-[var(--r-full)] bg-[var(--surface-2)] border-[1px] border-[var(--border)] text-[13px] text-[var(--text-primary)]">
                            <svg className="w-[16px] h-[16px]" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381C8.64 5.801 15.6 6.06 20.04 8.82c.54.3.72 1.02.42 1.56-.3.42-1.02.6-1.56.3h.18z" />
                            </svg>
                            Spotify
                        </div>
                        <div className="flex items-center justify-center gap-[4px] px-[16px] py-[10px] rounded-[var(--r-full)] bg-[var(--surface-2)] border-[1px] border-[var(--border)] text-[13px] text-[var(--text-primary)]">
                            <svg className="w-[16px] h-[16px]" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                            </svg>
                            YouTube
                        </div>
                    </div>
                </div>

                {/* CTA Button */}
                <button
                    onClick={() => {
                        const hitSound = new Audio('https://s3.amazonaws.com/freecodecamp/drums/Kick_n_Hat.mp3');
                        hitSound.volume = 0.5;
                        hitSound.play().catch(() => { });
                        // Smooth scroll to features
                        window.scrollTo({ top: window.innerHeight, behavior: 'smooth' });
                    }}
                    className="w-full max-w-[280px] h-[52px] rounded-[var(--r-md)] bg-[var(--accent)] text-[#000] font-semibold text-[16px] flex items-center justify-center mb-4 transition-transform active:scale-[0.98]"
                >
                    Get Started &rarr;
                </button>

                {/* Guest Mode */}
                <button
                    onClick={onEnter}
                    className="text-[13px] text-[var(--text-faint)] text-center transition-colors hover:text-[var(--text-primary)]"
                >
                    Guest Mode
                </button>
            </section>

            {/* ===== SCREEN 6: FEATURE DISCOVERY ===== */}
            <section className="relative w-full px-[16px] pt-10 pb-20 flex flex-col">
                <div className="max-w-md mx-auto w-full">
                    {[
                        {
                            icon: (
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-[22px] h-[22px]">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            ),
                            title: 'Smart Detection',
                            desc: 'AI reads your facial expression in real-time and matches your mood to music instantly'
                        },
                        {
                            icon: (
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-[22px] h-[22px]">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                                </svg>
                            ),
                            title: 'Smart Playlists',
                            desc: 'Curated tracks for every emotional state — from euphoria to deep focus and beyond'
                        },
                        {
                            icon: (
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-[22px] h-[22px]">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                            ),
                            title: 'Mood Timeline',
                            desc: 'Track your emotional journey over the last 24 hours with rich visual insights'
                        }
                    ].map((feat, i) => (
                        <div
                            key={feat.title}
                            className="bg-[var(--surface-1)] border-[1px] border-[var(--border)] rounded-[var(--r-lg)] p-[20px] mb-[12px] flex items-start gap-[16px]"
                        >
                            <div className="w-[44px] h-[44px] rounded-[var(--r-md)] bg-[var(--accent-dim)] text-[var(--accent)] flex items-center justify-center shrink-0">
                                {feat.icon}
                            </div>
                            <div>
                                <h3 className="text-[15px] font-semibold text-[var(--text-primary)] leading-tight">{feat.title}</h3>
                                <p className="text-[13px] text-[var(--text-secondary)] mt-[4px] leading-[1.5]">{feat.desc}</p>
                            </div>
                        </div>
                    ))}

                    <div className="mt-[32px]">
                        <button
                            onClick={onEnter}
                            className="w-full h-[52px] rounded-[var(--r-md)] bg-[var(--accent)] text-[#000] font-bold text-[16px] flex items-center justify-center transition-transform active:scale-[0.98]"
                        >
                            Start Listening
                        </button>
                    </div>
                </div>
            </section>
        </motion.div>
    );
}
