'use client';

import { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface CameraPageProps {
    onBack: () => void;
    moodColor: string;
}

export default function CameraPage({ onBack, moodColor }: CameraPageProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [cameraStarted, setCameraStarted] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

    const startCamera = async () => {
        setCameraError(null);
        try {
            // Stop any existing stream
            if (stream) {
                stream.getTracks().forEach(t => t.stop());
            }

            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 480 },
                    height: { ideal: 480 },
                    facingMode: facingMode,
                    aspectRatio: { ideal: 1 },
                },
            });

            setStream(mediaStream);
            setCameraStarted(true);

            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        } catch (err: any) {
            if (err.name === 'NotAllowedError') setCameraError('Camera access denied. Please allow camera permissions.');
            else if (err.name === 'NotFoundError') setCameraError('No camera found on this device.');
            else setCameraError('Unable to access camera. Please try again.');
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            setStream(null);
        }
        setCameraStarted(false);
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    };

    const toggleFacingMode = () => {
        const newMode = facingMode === 'user' ? 'environment' : 'user';
        setFacingMode(newMode);
        if (cameraStarted) {
            // Restart camera with new facing mode
            stopCamera();
            setTimeout(() => {
                startCamera();
            }, 200);
        }
    };

    // Restart camera when facing mode changes and camera is active
    useEffect(() => {
        if (cameraStarted) {
            startCamera();
        }
    }, [facingMode]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stream?.getTracks().forEach(t => t.stop());
        };
    }, []);

    return (
        <motion.div
            className="relative z-10 flex flex-col min-h-screen"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <button onClick={() => { stopCamera(); onBack(); }} className="p-1">
                    <svg className="w-6 h-6 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <h1 className="text-xs tracking-[0.3em] uppercase font-bold text-white/80">Camera Access</h1>
                <div className="w-6" />
            </div>

            {/* Camera Preview Area */}
            <div className="flex-1 flex flex-col items-center justify-center px-5 py-6">
                {/* Square Camera Container */}
                <div
                    className="relative w-full max-w-[340px] aspect-square rounded-2xl overflow-hidden border-2 transition-colors"
                    style={{
                        borderColor: cameraStarted ? moodColor + '60' : 'rgba(255,255,255,0.1)',
                        background: 'rgba(0,0,0,0.8)',
                        boxShadow: cameraStarted ? `0 0 40px ${moodColor}20` : 'none',
                    }}
                >
                    {/* Video feed */}
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                        style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                    />

                    {/* Placeholder when camera is off */}
                    {!cameraStarted && !cameraError && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                            <div className="w-20 h-20 rounded-full border-2 border-white/10 flex items-center justify-center">
                                <svg className="w-10 h-10 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </div>
                            <p className="text-xs text-white/30 text-center px-6">
                                Click "Start Camera" to begin
                            </p>
                        </div>
                    )}

                    {/* Error state */}
                    {cameraError && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
                            <div className="text-3xl">⚠️</div>
                            <p className="text-xs text-white/50 text-center">{cameraError}</p>
                        </div>
                    )}

                    {/* Corner brackets when camera is active */}
                    {cameraStarted && (
                        <div className="absolute inset-4 pointer-events-none">
                            <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 rounded-tl" style={{ borderColor: moodColor + '80' }} />
                            <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 rounded-tr" style={{ borderColor: moodColor + '80' }} />
                            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 rounded-bl" style={{ borderColor: moodColor + '80' }} />
                            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 rounded-br" style={{ borderColor: moodColor + '80' }} />
                        </div>
                    )}

                    {/* Live badge */}
                    {cameraStarted && (
                        <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-600/80 backdrop-blur-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            <span className="text-[9px] font-black tracking-widest uppercase text-white">LIVE</span>
                        </div>
                    )}
                </div>

                {/* Camera controls */}
                <div className="mt-6 flex flex-col items-center gap-4 w-full max-w-[340px]">
                    {!cameraStarted ? (
                        <motion.button
                            onClick={startCamera}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.95 }}
                            className="w-full py-4 rounded-xl text-sm font-black tracking-[0.2em] uppercase transition-all"
                            style={{
                                background: `linear-gradient(135deg, ${moodColor} 0%, ${moodColor}CC 100%)`,
                                color: '#000',
                                boxShadow: `0 0 30px ${moodColor}40`,
                            }}
                        >
                            📷 Start Camera
                        </motion.button>
                    ) : (
                        <div className="w-full flex gap-3">
                            {/* Flip camera button */}
                            <motion.button
                                onClick={toggleFacingMode}
                                whileTap={{ scale: 0.9 }}
                                className="flex-1 py-3 rounded-xl text-xs font-bold tracking-wider uppercase border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Flip
                            </motion.button>

                            {/* Stop camera button */}
                            <motion.button
                                onClick={stopCamera}
                                whileTap={{ scale: 0.9 }}
                                className="flex-1 py-3 rounded-xl text-xs font-bold tracking-wider uppercase bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600/30 transition-all"
                            >
                                ⬛ Stop Camera
                            </motion.button>
                        </div>
                    )}
                </div>

                {/* Camera info */}
                <div className="mt-6 text-center">
                    <p className="text-[9px] tracking-[0.2em] uppercase text-white/20">
                        {cameraStarted
                            ? `Camera active • ${facingMode === 'user' ? 'Front' : 'Rear'} camera`
                            : 'Square camera preview • 1:1 ratio'
                        }
                    </p>
                </div>
            </div>
        </motion.div>
    );
}
