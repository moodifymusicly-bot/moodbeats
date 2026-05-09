import { MoodType } from './types';

// The backend now natively supports the 10 abstract UI moods.
// We just pass them straight through. If empty, default to Lucid (happy).
export const mapAbstractMoodToBackend = (abstractMood: string | null): string => {
  if (!abstractMood) return 'Lucid';
  return abstractMood;
};
