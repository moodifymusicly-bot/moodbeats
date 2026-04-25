export type Track = {
  id: string;
  title: string;
  artist: string;
  duration: number; // in seconds
  coverUrl: string;
  moods: string[];
  youtubeId?: string;
};

const AMBIENT_FALLBACK = "jfKfPfyJRdk"; // lofi hip hop radio

export const MOODS = [
  "Weightless",
  "Velvet",
  "Embered",
  "Tide",
  "Static",
  "Midnight",
  "Drifting",
  "Electric",
  "Melancholic",
  "Lucid",
];

export const MOCK_TRACKS: Track[] = [
  {
    id: "1",
    title: "Neon Rain",
    artist: "Kaelen",
    duration: 215,
    coverUrl: "https://picsum.photos/seed/neonrain/400/400",
    moods: ["Midnight", "Electric", "Static"],
    youtubeId: AMBIENT_FALLBACK,
  },
  {
    id: "2",
    title: "Quiet Velocity",
    artist: "The Ember Trio",
    duration: 184,
    coverUrl: "https://picsum.photos/seed/quietvelocity/400/400",
    moods: ["Weightless", "Drifting", "Lucid"],
    youtubeId: AMBIENT_FALLBACK,
  },
  {
    id: "3",
    title: "Silk & Glass",
    artist: "Omera",
    duration: 245,
    coverUrl: "https://picsum.photos/seed/silkglass/400/400",
    moods: ["Velvet", "Melancholic", "Tide"],
    youtubeId: AMBIENT_FALLBACK,
  },
  {
    id: "4",
    title: "Ashen Sky",
    artist: "Rival Sons",
    duration: 198,
    coverUrl: "https://picsum.photos/seed/ashensky/400/400",
    moods: ["Embered", "Midnight"],
    youtubeId: AMBIENT_FALLBACK,
  },
  {
    id: "5",
    title: "Signals",
    artist: "Subway Ghosts",
    duration: 156,
    coverUrl: "https://picsum.photos/seed/signals/400/400",
    moods: ["Static", "Electric"],
    youtubeId: AMBIENT_FALLBACK,
  },
  {
    id: "6",
    title: "Ocean Floor",
    artist: "Mara V",
    duration: 290,
    coverUrl: "https://picsum.photos/seed/oceanfloor/400/400",
    moods: ["Tide", "Weightless", "Drifting"],
    youtubeId: AMBIENT_FALLBACK,
  },
  {
    id: "7",
    title: "Fading Pulse",
    artist: "Kaelen",
    duration: 210,
    coverUrl: "https://picsum.photos/seed/fadingpulse/400/400",
    moods: ["Embered", "Velvet", "Melancholic"],
    youtubeId: AMBIENT_FALLBACK,
  },
  {
    id: "8",
    title: "City Lights",
    artist: "Neon Syndicate",
    duration: 175,
    coverUrl: "https://picsum.photos/seed/citylights/400/400",
    moods: ["Electric", "Lucid"],
    youtubeId: AMBIENT_FALLBACK,
  },
  {
    id: "9",
    title: "Deep Sleep",
    artist: "Omera",
    duration: 320,
    coverUrl: "https://picsum.photos/seed/deepsleep/400/400",
    moods: ["Weightless", "Midnight"],
    youtubeId: AMBIENT_FALLBACK,
  },
  {
    id: "10",
    title: "Static Noise",
    artist: "Subway Ghosts",
    duration: 145,
    coverUrl: "https://picsum.photos/seed/staticnoise/400/400",
    moods: ["Static", "Tide"],
    youtubeId: AMBIENT_FALLBACK,
  },
  {
    id: "11",
    title: "Moonlight Sonata",
    artist: "Beethoven",
    duration: 360,
    coverUrl: "https://picsum.photos/seed/moonlightsonata/400/400",
    moods: ["Melancholic", "Midnight", "Lucid"],
    youtubeId: "4Tr0otuiQuU",
  },
  {
    id: "12",
    title: "Clair de Lune",
    artist: "Debussy",
    duration: 305,
    coverUrl: "https://picsum.photos/seed/clairdelune/400/400",
    moods: ["Weightless", "Drifting", "Velvet"],
    youtubeId: "CvFH_6DNRCY",
  },
  {
    id: "13",
    title: "Wichita Lineman",
    artist: "Glen Campbell",
    duration: 188,
    coverUrl: "https://picsum.photos/seed/wichitalineman/400/400",
    moods: ["Melancholic", "Drifting"],
    youtubeId: "psYyV_HaBb4",
  },
  {
    id: "14",
    title: "A Love Supreme",
    artist: "John Coltrane",
    duration: 412,
    coverUrl: "https://picsum.photos/seed/lovesupreme/400/400",
    moods: ["Lucid", "Velvet", "Embered"],
    youtubeId: "clRjbYO7_dU",
  },
  {
    id: "15",
    title: "Blue in Green",
    artist: "Miles Davis",
    duration: 337,
    coverUrl: "https://picsum.photos/seed/blueingreen/400/400",
    moods: ["Midnight", "Melancholic", "Tide"],
    youtubeId: "TLDflhhdPCg",
  },
];

export const getTrending = () => MOCK_TRACKS.slice(0, 5);
export const getFreshPicks = () => MOCK_TRACKS.slice(5, 10);
export const getTimelessClassics = () => MOCK_TRACKS.slice(10, 15);
export const getRecentlyPlayed = () => [MOCK_TRACKS[2], MOCK_TRACKS[7], MOCK_TRACKS[1], MOCK_TRACKS[8]];
export const getLibraryTracks = () => MOCK_TRACKS.filter((_, i) => i % 2 === 0);
