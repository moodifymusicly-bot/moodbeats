import { MoodType } from './types';

// The 10 abstract UI moods mapped to the 5 core backend moods
export const MOOD_MAPPING: Record<string, MoodType> = {
  'Weightless': 'study',
  'Velvet': 'study',
  'Embered': 'rock',
  'Tide': 'sad',
  'Static': 'study',
  'Midnight': 'sad',
  'Drifting': 'study',
  'Electric': 'gym',
  'Melancholic': 'sad',
  'Lucid': 'happy'
};

export const mapAbstractMoodToBackend = (abstractMood: string | null): MoodType => {
  if (!abstractMood) return 'happy';
  return MOOD_MAPPING[abstractMood] || 'happy';
};
