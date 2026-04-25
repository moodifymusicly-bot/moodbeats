'use client';

import Head from 'next/head';

export default function PreviewPage() {
  return (
    <>
      <Head>
        <title>MoodBeats | Sonic Noir</title>
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@200;400;700;800&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: `
        .material-symbols-outlined {
            font-variation-settings: 'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24;
        }
        .viewfinder-corner {
            width: 40px;
            height: 40px;
            border-color: #dcb8ff; /* Update to new primary color */
            position: absolute;
        }
        .glass-panel {
            background: rgba(32, 31, 32, 0.4);
            backdrop-filter: blur(40px);
            -webkit-backdrop-filter: blur(40px);
        }
` }} />
      <div className="font-manrope selection:bg-[#8a2be2]/30 bg-[#131314] text-[#e5e2e3] min-h-[100dvh] pb-[var(--nav-height)] overflow-x-hidden">
        {/* Decorative Grid Lines */}
        
{/* TopAppBar */}
<header className="fixed top-0 w-full z-50 bg-[#131314]/70 backdrop-blur-xl border-b-[0.5px] border-[#4c4354]/15 flex justify-between items-center px-6 py-4 w-full">
<div className="flex items-center gap-4">
<span className="material-symbols-outlined text-[#dcb8ff] hover:bg-[#3a393a] transition-colors duration-300 p-2 rounded-full cursor-pointer active:scale-95 transition-transform cubic-bezier(0.4,0,0.2,1)">menu</span>
<span className="text-xl font-black tracking-tighter text-[#e5e2e3]">MoodBeats</span>
</div>
<div className="flex items-center gap-2">
<span className="material-symbols-outlined text-[#dcb8ff] hover:bg-[#3a393a] transition-colors duration-300 p-2 rounded-full cursor-pointer active:scale-95 transition-transform cubic-bezier(0.4,0,0.2,1)">account_circle</span>
</div>
</header>
<main className="pt-20 pb-24">
{/* Hero: Viewfinder Section */}
<section className="px-6 py-8 relative">
<div className="relative w-full aspect-[4/5] rounded-xl overflow-hidden surface-container-low shadow-2xl group">
{/* Camera Feed Simulation */}
<div className="absolute inset-0 z-0">
<img className="w-full h-full object-cover grayscale opacity-60" data-alt="Cinematic close-up portrait of a thoughtful young woman in low key lighting with subtle violet and amber reflections on her skin" src="https://lh3.googleusercontent.com/aida-public/AB6AXuA6qcHfcxz1CRboScKA9zzHM5THUP0-fG0S5wVoKljnVZ5DTLNlXITy8ThNWFMQE8GMMSZXwjlDSLNtyXZrw3nxScySpOh4qsbBpzQ6kdOrRpr2iSi8C8eJgaZj4m4QXUNL0dTDItA47ek6Npz-vmoPHU0fltM1zeBhVnQvymTqaKeLlRRpsZUiSLNsZAL1UT98H4fRgrgbMgVZPt33M-GZX25i6fy4XOZslsSj4N5GYiQTdQjlsWp1BHMSp6A6DggXcYuiuxvFlHDu"/>
</div>
{/* Viewfinder UI Overlays */}
<div className="absolute inset-0 z-10 p-8 flex flex-col justify-between pointer-events-none">
<div className="flex justify-between items-start">
<div className="viewfinder-corner border-t-2 border-l-2 opacity-80"></div>
<div className="flex flex-col items-end gap-1">
<span className="text-[10px] font-bold tracking-widest text-[#ffbf00] uppercase">REC • MOOD_SCAN</span>
<span className="text-[10px] font-medium text-[#cfc2d7] font-mono">00:42:15:09</span>
</div>
<div className="viewfinder-corner border-t-2 border-r-2 opacity-80"></div>
</div>
{/* Scanning Light Trail */}
<div className="absolute inset-x-0 top-1/3 scanning-line opacity-50"></div>
<div className="flex justify-between items-end">
<div className="viewfinder-corner border-b-2 border-l-2 opacity-80"></div>
{/* Oscilloscope / Waveform Center */}
<div className="flex items-end gap-1 h-12 mb-2">
<div className="waveform-bar h-1/2"></div>
<div className="waveform-bar h-3/4"></div>
<div className="waveform-bar h-full"></div>
<div className="waveform-bar h-2/3"></div>
<div className="waveform-bar h-5/6"></div>
<div className="waveform-bar h-1/2"></div>
<div className="waveform-bar h-1/4"></div>
</div>
<div className="viewfinder-corner border-b-2 border-r-2 opacity-80"></div>
</div>
</div>
{/* Detection HUD Overlay */}
<div className="absolute inset-0 z-20 flex items-center justify-center">
<div className="text-center">
<div className="inline-block px-4 py-1 rounded-full border border-[#dcb8ff]/30 glass-panel mb-4">
<span className="text-xs font-bold tracking-[0.2em] text-[#dcb8ff] uppercase">Analyzing Neural Echoes</span>
</div>
<h2 className="text-4xl font-extrabold tracking-tighter text-[#e5e2e3] drop-shadow-lg">
                            SOULFUL
                        </h2>
</div>
</div>
{/* Abstract Light Play Overlay */}
<div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-[#8a2be2]/20 via-transparent to-[#ffbf00]/10"></div>
</div>
</section>
{/* Mood Selection Pills */}
<section className="px-6 mb-12">
<div className="flex overflow-x-auto gap-3 pb-4 no-scrollbar">
<button className="flex-shrink-0 px-8 py-3 rounded-full bg-gradient-to-br from-[#8a2be2] to-[#dcb8ff] text-[#480081] font-bold text-sm tracking-tight active:scale-95 transition-all">
                    Radiant
                </button>
<button className="flex-shrink-0 px-8 py-3 rounded-full surface-container-high border-[0.5px] border-[#4c4354]/15 text-[#e5e2e3] font-bold text-sm tracking-tight hover:bg-[#3a393a] transition-all">
                    Soulful
                </button>
<button className="flex-shrink-0 px-8 py-3 rounded-full surface-container-high border-[0.5px] border-[#4c4354]/15 text-[#e5e2e3] font-bold text-sm tracking-tight hover:bg-[#3a393a] transition-all">
                    Kinetic
                </button>
<button className="flex-shrink-0 px-8 py-3 rounded-full surface-container-high border-[0.5px] border-[#4c4354]/15 text-[#e5e2e3] font-bold text-sm tracking-tight hover:bg-[#3a393a] transition-all">
                    Nocturnal
                </button>
</div>
</section>
{/* Featured Playlist Bento Grid */}
<section className="px-6 grid grid-cols-2 gap-4">
<div className="col-span-2 h-48 rounded-xl relative overflow-hidden group cursor-pointer">
<img className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" data-alt="Abstract 3D render of vibrant purple and blue flowing silk textures with cinematic depth of field" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAfsY0V9eS-bH6dqe2EDF6SmIQjJlc-_KltSVHr18UhWae8QeseNqNvfIbPqewiTl8ZYwVQrAq3WtyvajeSW58bPPbaY_BH3rWqk_xE4gUQIuE5haaflelDvMWPLoeOcLa3ounnqXn8Y-Eqod6ATA0luG_NfNQVqUQ_oSK0dUgfKUayBqsaIKoPLIUTX8GJfA6qaX8eo6ToppPS953A4-jupealJx4HmzMHXgw-PPoVDLyq5dxIWbGWf8ts9URMIIHv5A6UX-T8wnYN"/>
<div className="absolute inset-0 bg-gradient-to-t from-[#131314] via-[#131314]/20 to-transparent"></div>
<div className="absolute bottom-4 left-4">
<span className="label-sm text-[#ffbf00] font-bold tracking-widest uppercase text-[10px] block mb-1">Curation</span>
<h3 className="text-2xl font-extrabold tracking-tight">Obsidian Rhythms</h3>
</div>
</div>
<div className="h-56 rounded-xl surface-container-low flex flex-col p-4 justify-between border-[0.5px] border-[#4c4354]/15">
<div className="flex justify-between items-start">
<span className="material-symbols-outlined text-[#dcb8ff]" style={{ fontVariationSettings: "\'FILL\' 1" }}>graphic_eq</span>
<span className="text-[10px] font-bold text-[#cfc2d7] font-mono">128 BPM</span>
</div>
<div>
<h4 className="text-lg font-bold tracking-tight leading-tight">Neon Pulse</h4>
<p className="text-xs text-[#cfc2d7] mt-1">Late Night Tech-House</p>
</div>
</div>
<div className="h-56 rounded-xl overflow-hidden relative border-[0.5px] border-[#4c4354]/15">
<img className="absolute inset-0 w-full h-full object-cover" data-alt="Blurred neon city lights at night reflected on a wet pavement with a premium violet color grade" src="https://lh3.googleusercontent.com/aida-public/AB6AXuB_R6NnSj5e5wsGT0TFUeCj-FPwzrSIyVFnsAqcqVyEw-ym_krmCrCIbaS5k5YNGFBvvLceRAmzYZ7kARoslo0ty9Im0BBvVNYEhpu9GKSFwpHkPD0FzOyqKpGVpMXn8WKdkFTU0Go1L_8RJFJjiwnFcHV_B463PnuhRMIJ3EEiih7E7hr6uOT6Cod9AYktw6NJCiqhZGNmEslsgvVymXPRfPqdy26yR3bMpFOnjiVw_MqylY8lAQArcPRCkCeArSWaOTPaQhnBiCkn"/>
<div className="absolute inset-0 glass-panel opacity-40"></div>
<div className="absolute inset-0 flex flex-col p-4 justify-between">
<span className="material-symbols-outlined text-[#ffbf00]">bolt</span>
<h4 className="text-lg font-bold tracking-tight leading-tight">Amber Glow</h4>
</div>
</div>
</section>
{/* Call to Action Section */}
<section className="px-6 py-12 text-center">
<h2 className="text-display-lg text-4xl font-extrabold tracking-[-0.04em] leading-none mb-6">
                Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#dcb8ff] to-[#ffbf00]">Pulse</span><br/>Defined.
            </h2>
<button className="w-full py-4 rounded-full bg-[#3a393a] text-[#e5e2e3] font-black text-sm tracking-[0.1em] uppercase border-[0.5px] border-[#4c4354]/30 hover:bg-[#2a2a2b] transition-colors active:scale-95">
                Launch Full Scanner
            </button>
</section>
</main>
{/* Footer */}
<footer className="bg-[#0e0e0f] border-t-[0.5px] border-[#4c4354]/15 w-full py-12 flex flex-col items-center gap-8 px-6">
<div className="font-bold text-[#e5e2e3]">MoodBeats</div>
<div className="flex gap-8">
<a className="font-['Manrope'] text-sm tracking-widest uppercase text-[#cfc2d7] hover:text-[#dcb8ff] transition-colors" href="#">Privacy</a>
<a className="font-['Manrope'] text-sm tracking-widest uppercase text-[#cfc2d7] hover:text-[#dcb8ff] transition-colors" href="#">Terms</a>
<a className="font-['Manrope'] text-sm tracking-widest uppercase text-[#cfc2d7] hover:text-[#dcb8ff] transition-colors" href="#">Contact</a>
</div>
<div className="font-['Manrope'] text-xs tracking-widest uppercase text-[#cfc2d7] opacity-50">
            © 2024 MoodBeats. All rights reserved.
        </div>
</footer>
{/* FAB Suppression: Not rendered for this landing/intro experience */}

      </div>
    </>
  );
}
