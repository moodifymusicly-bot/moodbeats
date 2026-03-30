MoodBeats: Exploring a More Natural Way to Connect Emotion with Music

Abstract

When you look at the way we listen to music today, it is clear that we have a bit of a problem with having too many choices. We have millions of songs at our fingertips, but we often end up listening to the same ten tracks because picking something new feels like a chore. This is where MoodBeats comes in. It is basically a web app that tries to fix this by looking at how you feel instead of just asking you to type in a search box. By using some pretty cool tecnologies like real-time face tracking and GPU shaders, we have built a bridge between what is going on in your head and what is coming out of your speakers. Right now, our reccomendation engine is still in its early stages—we are mostly using a set of rules and a hand-picked list of songs—but the whole infrastucture is built to eventually handle some really serious machine learning. This paper is basically a deep dive into how we built it, the stuff we used like Next.js and FastAPI, and where we are planning to take it next.

1. Why We Built This: The Problem with Streaming

Music has always been a reflection of the human condition. Think about it: whether you are crushing a workout at the gym, staying up late for a deadline, or just wallowing in a bit of heartbreak, there is always that one specific song that "gets" it. But standard streaming apps? They are kind of stuck in the past. They recommend tracks based on what you played yesterday, which is useless if you are having a totally different kind of day today. We wanted to build something that feels alive.

If you go back to the early days of radio, you had DJs who were basically human recommendation engines. They knew the vibe, they knew the weather, and they knew the news. They could pick a track that felt right for a rainy Tuesday morning. But as everything moved to the cloud, we lost that human touch. Now we have "The Algorithm," which is basically a giant math equation trying to guess what you want based on a million other people's data. It is efficient, sure, but it feels cold.

The real headache is "choice paralysis." It is a weird paradox—the more options you have, the harder it is to actually pick one. Every single day, thousands of new tracks get dumped onto YouTube and Spotify. It is overwhelming. MoodBeats is our attempt to automate that filtering process. We decided to let your own face be the search query. By cutting out the middleman, we are trying to make the music react to you, not the other way around.

2. What the App Can Actually Do Right Now

Since we are still in the early prototype phase, our main goal was just making sure the core "emotion-to-audio" pipeline worked without a hitch. We wanted it to be zero-config. You just open the site, click "allow" on the camera prompt, and the app starts doing the heavy lifting. We didn't want any complex onboarding or long surveys. We just wanted you to be able to listen to music that fits your mood immediately.

2.1 Reading Your Face in Real-Time
The face tracking is the heart of the whole thing. We are using Face-api.js, which is pretty great because it runs entirely in the browser. No video ever leaves your computer. This was a huge deal for us from the start—no one wants their webcam footage being sent to some random server in the cloud. The app just looks at the landmarks on your face—the way your eyebrows move or the corners of your mouth—and tries to figure out if you are happy, sad, focused, or energetic. We have mapped these micro-expressions to a few core moods. It is not always 100% perfect—sometimes it thinks I'm "sad" when I'm just concentrated—but it is surprisingly good at catching those fleeting feelings that you might not even realize you are showing.

2.2 Taking Manual Control
Technology fails sometimes. Or, more often, humans are complicated. You might be feeling sad but actually want to listen to something upbeat to snap out of it. We built in a manual override for exactly that reason. We don't want the AI to be a boss; we want it to be a helper. The UI uses Framer Motion, so when you click a mood icon, the whole interface doesn't just snap to a new color; it kind of "melts" into the next state. It makes the app feel tactile and responsive, like you are actually interacting with a physical object.

2.3 The Mood History Feature
We also started tinkering with a "Mood Timeline." It is essentially a visual diary of your emotional journey during a listening session. It shows you what songs played and how your face was reacting at the time. All of this is tucked away in a PostgreSQL database. Eventually, we want the app to look at this history and learn your specific quirks. If it sees that you always skip "Happy" tracks when you are feeling blue, it will stop trying to force-feed you cheerfulness and maybe give you something more cathartic instead. We think this kind of "emotional memory" is what's missing from current music apps.

2.4 A Quick Example: Sarah's Morning
Imagine Sarah. She is a dev working from home. At 9 AM, she opens MoodBeats. The camera sees she is in "work mode"—neutral, focused—and the app starts a low-fi ambient playlist. The background is a calm, pulsating indigo. Later, after a stressful meeting with her boss, her face looks a bit tired and sad. The app notices the shift and gently transitions to some slow acoustic tracks. By 4 PM, she is ready for a workout. She hits the "Gym" button, and suddenly the app is blasting high-energy tracks while the background erupts into neon pink shaders. That is the kind of friction-less experience we are building. It is about making technology feel like a companion rather than just a tool.

3. The Tech Stuff Under the Hood

To keep everything feeling snappy, we had to be very deliberate about our stack. We needed speed, but we also needed a setup that wouldn't become a nightmare to maintain. We tried out a few different frameworks, but we eventually landed on a mix of modern JavaScript and high-performance Python.

3.1 The Frontend Side
The site is built with Next.js 14. We are using the App Router, which made handling things like loading states and metadata way easier. It also helps with performance because it does a lot of the heavy lifting on the server before the page even gets to you.
Everything is in TypeScript. When you are piping video frames into a detector and then sending those results to a backend, you really want that type safety so things don't blow up at runtime. It saves us a lot of headaches when we are trying to add new features.
For styling, we went with Tailwind CSS. It works perfectly with our mood-based color shifts. We just update a few CSS variables and the whole app changes its look instantly. It's much faster than writing custom CSS for every single mood.
Like I mentioned, Face-api.js handles the detection. We actually offloaded it to a Web Worker so the main UI thread stays at a buttery-smooth 60fps. If we didn't do this, the whole app would feel stuttery every time the face detector ran, which would totally ruin the "chill" vibe we are going for.

3.2 The Backend Side
FastAPI is our workhorse on the backend. It is Python-based but incredibly fast. It uses asynchronous programming, so the API never gets blocked while waiting for a database to respond. This is really important when you have hundreds of people all asking for song recommendations at the same time.
Our database is PostgreSQL, handled through SQLAlchemy. We chose a relational DB because our data is actually quite structured—songs, artists, and moods all have clear relationships. It's much more reliable than using a NoSQL database for this kind of work.
We also use Redis for caching. If the reccomendation engine calculates a fresh playlist for a specific mood, we store it in Redis for a few minutes. This keeps the app feeling "instant" even when the database is working hard. It's a small detail, but it makes a huge difference in how the app feels.

4. Making it Look Good with Shaders

We didn't want MoodBeats to look like a standard corporate music app. It needed to feel immersive, almost like a living thing. That is why we used GLSL shaders. We wanted the visuals to feel as "organic" as the emotions we are trying to track.

4.1 Powering Visuals with the GPU
Instead of heavy image files or static backgrounds, we wrote code that runs directly on your graphics card. These shaders create procedurally generated patterns in real-time. In "Happy" mode, you might see soft, undulating waves of light that look almost like a lava lamp. In "Energetic," those patterns get sharper and move a lot faster. Since it is all math, it looks perfect on any screen and barely uses any bandwidth. It also means the background is never exactly the same twice, which keeps the app feeling fresh.

4.2 Bringing in Three.js
Three.js acts as our bridge. It manages the WebGL context and lets us pass variables from the React side (like the current time or the current mood) into the shader code. This is how we sync the visuals with the music's energy. We can even pass in things like the "confidence score" from the face detector to make the background more or less intense depending on how strongly the user is feeling a certain emotion. It's a subtle effect, but it adds a lot of depth.

5. Data Architecture: The Heart of the App

Our data model is built for the long haul. We aren't just storing titles and artists; we are trying to build a complete "musical map" of human emotion.

5.1 Breaking Down the Music
Every track in our system is enriched with specific "Audio Features." We look at:
Valence: The musical "positivity" of a track. A high valence song sounds happy, while a low valence song sounds sad.
Energy: How intense or fast it feels. A death metal track has high energy, while a solo piano piece has low energy.
Danceability: The stability of the beat. This tells us if a song is good for a party or just for background listening.
Acousticness: Whether it is organic or synthesized. This helps us distinguish between "natural" chill music and "electronic" chill music.

5.2 Tracking What You Do
We record nearly every interaction. If you skip a song after ten seconds, we take note. If you turn up the volume during a specific chorus, we record that too. This granular data is what will eventually let us move away from simple rules and toward a truly intelligent AI. We are also building a "Feedback Loop" where the user can tell the app if a certain song didn't fit the mood, which helps us improve our tags over time.

6. The Current "Hardcoded" Reccomendation Engine

Right now, we are in the "Heuristic" phase. Some people might call it "hardcoded," but it is actually a fairly complex set of rules. We wanted to start with something that worked perfectly for a small group of people before trying to scale it up to the whole world.

6.1 Solving the "Cold Start" Problem
True AI systems have a big weakness: they need massive amounts of data to start being useful. If we launched with a pure neural network, the app wouldn't know what to play on day one. It would just be guessing at random. By using a heuristic engine first, we solved this. We defined what "Happy" or "Sad" sounds like based on musical theory and pre-tagged a seed dataset. This meant that from the very first minute the app was online, it actually felt smart.

6.2 The Scoring Logic
When you request a mood, the backend runs a scoring algorithm that we spent weeks tuning:
First, it filters for songs that match the target mood's profile.
Then it calculates a "Distance Score" to see which tracks are the best fit musically. It's like finding the nearest neighbor in a multi-dimensional musical space.
It adds a "Popularity Bonus" so you get a mix of hits and deep cuts. We don't want the app to only play obscure indie tracks, but we also don't want it to just be Top 40.
Finally, it applies a "Variety Penalty" so you don't hear the same artist five times in a row. This is really important for keeping the discovery process interesting.
It feels smart because it is based on how humans actually think about music. It's more of a "musical theory" approach than a "pure data" approach.

6.3 Future Engineering Hurdles
Our biggest challenge is scaling. As our database grows from hundreds of songs to millions, simple filters won't be enough. We are already looking into FAISS (Facebook AI Similarity Search) to keep our recommendation times under 50ms. We also need to figure out how to handle different languages and cultures, because a "happy" song in one culture might sound "aggressive" in another. It's a fascinating problem that we are just starting to dig into.

7. Mapping Emotions Across Different Genres

We realized early on that "Happy" is a subjective term. Joy in a Jazz track sounds totally different than joy in a Metal track. It's not just about the BPM or the key; it's about the "texture" of the sound.
In Jazz, it might be bright brass and a swing beat.
In Metal, it is often about high energy and raw intensity.
In Classical, it is major keys and light, airy orchestration.
Our engine is designed to mix these up. We don't want the app to be a genre-box. We want it to be an emotional mirror. We're also trying to find "cross-genre" connections—like finding a hip-hop track that has the same emotional "weight" as a certain post-rock track.

8. The Machine Learning Roadmap

The next phase for MoodBeats is moving to a Hybrid Recommender system. This is where things get really exciting.

8.1 Vector Similarity
We are building a pipeline to turn every song into a high-dimensional vector. Using FAISS, we can then find the "Nearest Neighbors" of your current emotional state in microseconds. This is how we will handle the "Infinite Catalog" problem. Instead of searching for tags, we are searching for "positions" in a mathematical space of sound.

8.2 Deep Learning with PyTorch
We are also prototyping a PyTorch model for collaborative filtering. This will let the app discover non-obvious connections—like the fact that people who enjoy "Sad Indie" also tend to like "Ambient Electronica" when they are trying to focus. This kind of "latent relationship" discovery is only possible with deep learning. We are training our model on millions of user interactions to see if we can uncover the "hidden rules" of how people use music to regulate their emotions.

9. Ethical Considerations and Privacy

You can't build an app that uses a camera without talking about privacy. It is the most important thing we do, and it's something we talk about almost every day in the dev meetings.

9.1 Privacy by Design
Our rule is simple: we don't store your face. Period. All the analysis happens in the browser's temporary memory. As soon as a frame is processed, it is deleted. We only store the "Mood Label" (like "Happy") to help improve the music, and even that is anonymized. We want people to feel safe using the app, not like they are being watched by some big brother AI. We're even thinking about adding a "Privacy Mode" that turns off the camera entirely and just uses manual input, for people who are extra careful.

9.2 Emotional Regulation
We also think about the ethics of mood. Music is a powerful tool. It can help you feel better, but it can also trap you in a negative loop. If you are sad and the app keeps playing sad music, it might actually make you feel worse. MoodBeats is designed to be a tool for regulation, not just reflection. We want to help you process your emotions. We are even looking at building a "Mood Booster" feature that slowly transitions you from a "Sad" state to a "Calm" or "Content" state over the course of thirty minutes. It is about giving you control over your mental state, not just following an algorithm blindly.

10. Conclusion: A More Human Way to Listen

MoodBeats is a project about connection. We are trying to use tecnology to get rid of the barriers between us and the art we love. By ditching the search bar and focusing on the human face, we are creating a music player that feels like it actually understands you. It's a small step towards a more "human" kind of technology.

Our reccomendation engine might still be in its early, rule-based days, but the foundation is solid. As we bring in Spotify and launch our full ML models, the experience is only going to get deeper. We believe the future of music isn't about better keywords—it is about better emotional resonance. It's about building a bridge between our digital lives and our real, messy, human emotions.

References & Tecnologies We Used:
Next.js 14 for the core web app structure.
FastAPI for the high-speed Python backend.
Face-api.js for client-side mood detection that stays private.
FAISS for future vector searching across huge catalogs.
Three.js for the immersive, procedural backgrounds.
YouTube IFrame API for current playback of millions of videos.
Spotify Web API for our next big update (we're really excited about this).
Framer Motion for all the smooth UI transitions.
DeepFace for some of our backend testing and verification.
PyTorch for the neural networks we are building in the lab.
SQLAlchemy for our PostgreSQL database work.
Redis for the caching layer that makes everything feel fast.
Tailwind CSS for the dynamic styling system.
TypeScript for keeping the whole codebase from falling apart.
GLSL for the custom shaders that power the visuals.
Web Workers for keeping the UI thread free for the user.
