'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { User } from '@/lib/types';

interface AuthModalProps {
    onClose: () => void;
    onAuth: (user: User) => void;
}

export default function AuthModal({ onClose, onAuth }: AuthModalProps) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            let data;
            if (isLogin) {
                data = await api.login(email, password);
            } else {
                data = await api.register(username, email, password);
            }
            onAuth(data.user);
        } catch (err: any) {
            setError(err.message || 'Authentication failed');
        }
        setLoading(false);
    };

    const handleDemoLogin = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await api.login('demo@moodmusic.app', 'demo1234');
            onAuth(data.user);
        } catch (err: any) {
            setError('Demo login failed. Is the backend running?');
        }
        setLoading(false);
    };

    return (
        <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <motion.div
                className="relative w-full max-w-md glass rounded-2xl p-8 shadow-2xl"
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
            >
                <h2 className="font-display text-2xl font-bold mb-2">
                    {isLogin ? 'Welcome Back' : 'Create Account'}
                </h2>
                <p className="text-white/40 text-sm mb-6">
                    {isLogin ? 'Sign in to get personalized recommendations' : 'Join MoodMusic for a personalized experience'}
                </p>

                {error && (
                    <div className="mb-4 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm border border-red-500/20">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {!isLogin && (
                        <div>
                            <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wider">Username</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                                placeholder="cooluser123"
                                required
                            />
                        </div>
                    )}
                    <div>
                        <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wider">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                            placeholder="you@example.com"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wider">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                            placeholder="••••••••"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2.5 rounded-lg bg-white text-black font-semibold text-sm hover:bg-white/90 transition-colors disabled:opacity-50"
                    >
                        {loading ? 'Loading...' : isLogin ? 'Sign In' : 'Create Account'}
                    </button>
                </form>

                <div className="my-4 flex items-center gap-3">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-xs text-white/30">or</span>
                    <div className="flex-1 h-px bg-white/10" />
                </div>

                <button
                    onClick={handleDemoLogin}
                    className="w-full py-2.5 rounded-lg glass glass-hover text-sm font-medium transition-all"
                >
                    🎵 Try Demo Account
                </button>

                <p className="text-center text-white/30 text-xs mt-4">
                    {isLogin ? "Don't have an account? " : 'Already have an account? '}
                    <button
                        onClick={() => { setIsLogin(!isLogin); setError(''); }}
                        className="text-blue-400 hover:text-blue-300 transition-colors"
                    >
                        {isLogin ? 'Sign up' : 'Sign in'}
                    </button>
                </p>
            </motion.div>
        </motion.div>
    );
}
