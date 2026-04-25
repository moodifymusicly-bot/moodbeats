# MoodBeats Dark Theme UI Redesign

This project involves entirely redesigning the MoodBeats UI with a custom dark-theme "Nocturnal Curator" aesthetic. The current design will be stripped of purple gradients, generic template components, and rounded icon circles, and replaced with an electric teal accent, warm dark neutral surfaces, and highly atmospheric player controls.

## User Review Required
- Please review the sequence of execution. I will execute the changes **one screen at a time**, showing the updated code as requested. I will pause after each file update so you can verify it, unless you'd prefer I proceed automatically.
- Let me know if you want the `globals.css` and `layout.tsx` changes to be done together with Screen 1, or separately first.

## Proposed Changes

### Global Design System (Tokens & Font)
- **`frontend/src/styles/globals.css`**: Inject the provided `:root` CSS tokens. Add global rules (`body` background, typography, transitions, scrollbar hiding).
- **`frontend/src/app/layout.tsx`**: Replace the current font imports with Google Fonts `Inter` as specified.

### SCREEN 1 — SPLASH / ONBOARDING
#### [MODIFY] `frontend/src/views/LandingView.tsx`
- Replace the hero section with the centered column layout, animated sine-wave SVG, and solid teal "Get Started" CTA.
- Remove all purple gradients, integrating the new `var(--surface-2)` glassmorphism.

### SCREEN 6 — FEATURE DISCOVERY (Also in LandingView)
#### [MODIFY] `frontend/src/views/LandingView.tsx`
- Redesign the feature cards to a left-aligned layout with teal square icons and clean descriptions.
- Update the bottom CTA to a solid teal button.

### SCREEN 2 — HOME SCREEN
#### [MODIFY] `frontend/src/views/HomeView.tsx`
- Implement the new Header with "MOODBEATS" wordmark.
- Restyle the "Detect Your Mood" card with the linear gradient background and teal border.
- Refactor track cards with 1/1 aspect ratio covers and bottom-right duration overlays.
- Update horizontal scroll containers to hide scrollbars and ensure correct padding.

### SCREEN 3 — NOW PLAYING (Player)
#### [MODIFY] `frontend/src/views/PlayingView.tsx` (or `NowPlaying.tsx`)
- Implement a full-screen player layout.
- Add dynamic ambient glow effect (`.player-ambient`).
- Add breathing animation for playing album art (`.album-art.playing`).
- Implement the custom slider progress bar and bottom action pills (YouTube, Playlist).

### SCREEN 4 — BOTTOM NAVIGATION
#### [MODIFY] `frontend/src/components/BottomNav.tsx`
- Replace existing nav styling with the highly blurred, `rgba(14, 14, 16, 0.85)` background.
- Implement new active states (accent color, glowing drop-shadow, and top dot indicator).

### SCREEN 5 — MINI PLAYER
#### [MODIFY] `frontend/src/components/MiniPlayer.tsx`
- Apply the new floating pill design (`var(--surface-2)` with blur, `border-radius: var(--r-lg)`).
- Ensure z-index layering above the navigation bar but below overlays.

## Verification Plan
1. **Visual Testing**: Verify changes locally at mobile viewport width (375px).
2. **Safe Area Checks**: Confirm padding-bottom uses `calc(var(--nav-height) + var(--safe-bottom))` on all screens so navigation doesn't overlap content.
3. **Aesthetic Compliance**: Ensure zero instances of purple, gradient buttons, or colored-circle icons. Accent color should exclusively be `#00d4ff` (Teal).
