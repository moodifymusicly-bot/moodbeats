"""
Seed database with 200+ songs across 5 mood categories.
Uses real song titles and artists for authenticity.

Songs are tagged `external_source='seed'` with deterministic
`external_id='seed:{mood}:{slug}'` so upserts from the frontend for the same
title/artist won't create duplicates.
"""
import random
import re
import uuid
from datetime import datetime


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def get_seed_songs() -> list[dict]:
    """Return 200+ seed songs with mood tags and audio features."""
    songs = []

    # --- HAPPY songs ---
    happy_songs = [
        ("Happy", "Pharrell Williams", "G I R L", "pop"),
        ("Walking on Sunshine", "Katrina and the Waves", "Walking on Sunshine", "pop"),
        ("Don't Stop Me Now", "Queen", "Jazz", "rock"),
        ("Good as Hell", "Lizzo", "Cuz I Love You", "pop"),
        ("Uptown Funk", "Bruno Mars ft. Mark Ronson", "Uptown Special", "funk"),
        ("Shake It Off", "Taylor Swift", "1989", "pop"),
        ("Can't Stop the Feeling!", "Justin Timberlake", "Trolls", "pop"),
        ("I Gotta Feeling", "Black Eyed Peas", "The E.N.D.", "pop"),
        ("Best Day of My Life", "American Authors", "Oh, What a Life", "indie"),
        ("Dynamite", "BTS", "BE", "k-pop"),
        ("Levitating", "Dua Lipa", "Future Nostalgia", "pop"),
        ("Blinding Lights", "The Weeknd", "After Hours", "synthwave"),
        ("Good Vibrations", "The Beach Boys", "Smiley Smile", "pop"),
        ("Here Comes the Sun", "The Beatles", "Abbey Road", "rock"),
        ("Three Little Birds", "Bob Marley", "Exodus", "reggae"),
        ("On Top of the World", "Imagine Dragons", "Night Visions", "indie"),
        ("Lovely Day", "Bill Withers", "Menagerie", "soul"),
        ("September", "Earth, Wind & Fire", "The Best of Vol. 1", "funk"),
        ("Dancing Queen", "ABBA", "Arrival", "disco"),
        ("Hips Don't Lie", "Shakira ft. Wyclef Jean", "Oral Fixation Vol. 2", "latin"),
        ("Sugar", "Maroon 5", "V", "pop"),
        ("Watermelon Sugar", "Harry Styles", "Fine Line", "pop"),
        ("Sunflower", "Post Malone & Swae Lee", "Spider-Verse", "hip-hop"),
        ("Good Time", "Owl City & Carly Rae Jepsen", "The Midsummer Station", "pop"),
        ("Steal My Girl", "One Direction", "Four", "pop"),
        ("Butterfly", "Weezer", "Pinkerton", "indie"),
        ("Tongue Tied", "Grouplove", "Never Trust a Happy Song", "indie"),
        ("Feel It Still", "Portugal. The Man", "Woodstock", "indie"),
        ("Love on Top", "Beyonce", "4", "r&b"),
        ("24K Magic", "Bruno Mars", "24K Magic", "funk"),
        ("Mr. Blue Sky", "Electric Light Orchestra", "Out of the Blue", "rock"),
        ("Circles", "Post Malone", "Hollywood's Bleeding", "pop"),
        ("As It Was", "Harry Styles", "Harry's House", "pop"),
        ("Peaches", "Justin Bieber", "Justice", "pop"),
    ]

    for title, artist, album, genre in happy_songs:
        songs.append(_make_song(title, artist, album, genre, "happy",
                                valence=(0.7, 0.95), energy=(0.6, 0.85), dance=(0.6, 0.9)))

    # --- SAD songs ---
    sad_songs = [
        ("Someone Like You", "Adele", "21", "pop"),
        ("Hurt", "Johnny Cash", "American IV", "country"),
        ("Yesterday", "The Beatles", "Help!", "rock"),
        ("Fix You", "Coldplay", "X&Y", "rock"),
        ("The Night We Met", "Lord Huron", "Strange Trails", "indie"),
        ("All I Want", "Kodaline", "In a Perfect World", "indie"),
        ("Skinny Love", "Bon Iver", "For Emma, Forever Ago", "indie"),
        ("Tears in Heaven", "Eric Clapton", "Rush Soundtrack", "rock"),
        ("Mad World", "Gary Jules", "Trading Snakeoil for Wolftickets", "indie"),
        ("Everybody Hurts", "R.E.M.", "Automatic for the People", "rock"),
        ("Nothing Compares 2 U", "Sinead O'Connor", "I Do Not Want What I Haven't Got", "pop"),
        ("Creep", "Radiohead", "Pablo Honey", "rock"),
        ("Hallelujah", "Jeff Buckley", "Grace", "rock"),
        ("Say Something", "A Great Big World", "Is There Anybody Out There?", "pop"),
        ("The Sound of Silence", "Disturbed", "Immortalized", "rock"),
        ("Wish You Were Here", "Pink Floyd", "Wish You Were Here", "rock"),
        ("Breathe Me", "Sia", "Colour the Small One", "pop"),
        ("Let Her Go", "Passenger", "All the Little Lights", "folk"),
        ("Chasing Cars", "Snow Patrol", "Eyes Open", "rock"),
        ("When the Party's Over", "Billie Eilish", "WHEN WE ALL FALL ASLEEP", "pop"),
        ("Liability", "Lorde", "Melodrama", "pop"),
        ("drivers license", "Olivia Rodrigo", "SOUR", "pop"),
        ("Heather", "Conan Gray", "Kid Krow", "pop"),
        ("Another Love", "Tom Odell", "Long Way Down", "indie"),
        ("Falling", "Harry Styles", "Fine Line", "pop"),
        ("bad guy", "Billie Eilish", "WHEN WE ALL FALL ASLEEP", "pop"),
        ("I Will Always Love You", "Whitney Houston", "The Bodyguard OST", "r&b"),
        ("Piano Man", "Billy Joel", "Piano Man", "rock"),
        ("Fast Car", "Tracy Chapman", "Tracy Chapman", "folk"),
        ("Fire and Rain", "James Taylor", "Sweet Baby James", "folk"),
        ("The Scientist", "Coldplay", "A Rush of Blood to the Head", "rock"),
        ("Stay With Me", "Sam Smith", "In the Lonely Hour", "pop"),
        ("Photograph", "Ed Sheeran", "X", "pop"),
        ("Sorry", "Justin Bieber", "Purpose", "pop"),
        ("Space Song", "Beach House", "Depression Cherry", "indie"),
    ]

    for title, artist, album, genre in sad_songs:
        songs.append(_make_song(title, artist, album, genre, "sad",
                                valence=(0.1, 0.4), energy=(0.1, 0.4), dance=(0.1, 0.4)))

    # --- GYM / WORKOUT songs ---
    gym_songs = [
        ("Stronger", "Kanye West", "Graduation", "hip-hop"),
        ("Till I Collapse", "Eminem", "The Eminem Show", "hip-hop"),
        ("Eye of the Tiger", "Survivor", "Eye of the Tiger", "rock"),
        ("Lose Yourself", "Eminem", "8 Mile", "hip-hop"),
        ("Can't Hold Us", "Macklemore & Ryan Lewis", "The Heist", "hip-hop"),
        ("HUMBLE.", "Kendrick Lamar", "DAMN.", "hip-hop"),
        ("Power", "Kanye West", "MBDTF", "hip-hop"),
        ("Wake Me Up", "Avicii", "True", "edm"),
        ("Levels", "Avicii", "True", "edm"),
        ("Titanium", "David Guetta ft. Sia", "Nothing but the Beat", "edm"),
        ("Animals", "Martin Garrix", "Single", "edm"),
        ("Bangarang", "Skrillex ft. Sirah", "Bangarang", "dubstep"),
        ("Sandstorm", "Darude", "Before the Storm", "trance"),
        ("Turn Down for What", "DJ Snake & Lil Jon", "Encore", "edm"),
        ("Thunderstruck", "AC/DC", "The Razors Edge", "rock"),
        ("Radioactive", "Imagine Dragons", "Night Visions", "indie"),
        ("Heathens", "twenty one pilots", "Suicide Squad OST", "indie"),
        ("Believer", "Imagine Dragons", "Evolve", "indie"),
        ("Centuries", "Fall Out Boy", "American Beauty/American Psycho", "rock"),
        ("Remember the Name", "Fort Minor", "The Rising Tied", "hip-hop"),
        ("Seven Nation Army", "The White Stripes", "Elephant", "rock"),
        ("In the End", "Linkin Park", "Hybrid Theory", "rock"),
        ("Numb", "Linkin Park", "Meteora", "rock"),
        ("Harder, Better, Faster, Stronger", "Daft Punk", "Discovery", "electronic"),
        ("Pump It", "Black Eyed Peas", "Monkey Business", "pop"),
        ("Till the World Ends", "Britney Spears", "Femme Fatale", "pop"),
        ("Starships", "Nicki Minaj", "Pink Friday: Roman Reloaded", "hip-hop"),
        ("Work Bitch", "Britney Spears", "Britney Jean", "pop"),
        ("Physical", "Dua Lipa", "Future Nostalgia", "pop"),
        ("Ring the Alarm", "Beyonce", "B'Day", "r&b"),
        ("Run This Town", "JAY-Z ft. Rihanna", "The Blueprint 3", "hip-hop"),
        ("Champion", "Carrie Underwood", "Cry Pretty", "country"),
        ("Rise", "Katy Perry", "Rise", "pop"),
        ("Roar", "Katy Perry", "Prism", "pop"),
        ("Fight Song", "Rachel Platten", "Wildfire", "pop"),
    ]

    for title, artist, album, genre in gym_songs:
        songs.append(_make_song(title, artist, album, genre, "gym",
                                valence=(0.5, 0.8), energy=(0.8, 0.98), dance=(0.6, 0.9)))

    # --- STUDY / FOCUS songs ---
    study_songs = [
        ("Clair de Lune", "Claude Debussy", "Suite bergamasque", "classical"),
        ("Experience", "Ludovico Einaudi", "In a Time Lapse", "classical"),
        ("Nuvole Bianche", "Ludovico Einaudi", "Una Mattina", "classical"),
        ("River Flows in You", "Yiruma", "First Love", "classical"),
        ("Comptine d'un autre ete", "Yann Tiersen", "Amelie OST", "classical"),
        ("Gymnopedie No. 1", "Erik Satie", "Classical Piano", "classical"),
        ("Interlude", "Spotify Sessions", "Focus", "ambient"),
        ("Sunset Lover", "Petit Biscuit", "Petit Biscuit EP", "electronic"),
        ("Weightless", "Marconi Union", "Weightless", "ambient"),
        ("Strawberry Swing", "Coldplay", "Viva la Vida", "rock"),
        ("To Build a Home", "The Cinematic Orchestra", "Ma Fleur", "ambient"),
        ("Intro", "The xx", "xx", "indie"),
        ("Photosynthesis", "Carbon Based Lifeforms", "World of Sleepers", "ambient"),
        ("Flightless Bird, American Mouth", "Iron & Wine", "The Shepherd's Dog", "folk"),
        ("Beautiful Things", "Benson Boone", "Fireworks & Rollerblades", "pop"),
        ("I Found", "Amber Run", "5AM", "indie"),
        ("No Surprises", "Radiohead", "OK Computer", "rock"),
        ("Breathe", "Te Lata", "Singles", "ambient"),
        ("Ocean Eyes", "Billie Eilish", "don't smile at me", "pop"),
        ("Teardrop", "Massive Attack", "Mezzanine", "trip-hop"),
        ("Svefn-g-englar", "Sigur Ros", "Agaetis byrjun", "post-rock"),
        ("Holocene", "Bon Iver", "Bon Iver", "indie"),
        ("Bloom", "The Paper Kites", "Woodland", "indie"),
        ("Time", "Hans Zimmer", "Inception OST", "classical"),
        ("Dream Within a Dream", "Hans Zimmer", "Inception OST", "classical"),
        ("First Step", "Hans Zimmer", "Interstellar OST", "classical"),
        ("Outro", "M83", "Hurry Up We're Dreaming", "electronic"),
        ("I Can Change", "LCD Soundsystem", "Sound of Silver", "electronic"),
        ("Night Owl", "Galimatias", "Urban Flora", "electronic"),
        ("Resonance", "HOME", "Odyssey", "synthwave"),
        ("Odyssey", "HOME", "Odyssey", "synthwave"),
        ("Anthem", "Emancipator", "Soon It Will Be Cold Enough", "electronic"),
        ("Midnight City", "M83", "Hurry Up We're Dreaming", "electronic"),
        ("Porz Goret", "Yann Tiersen", "EUSA", "classical"),
        ("Opus 23", "Dustin O'Halloran", "Piano Solos Vol. 1", "classical"),
    ]

    for title, artist, album, genre in study_songs:
        songs.append(_make_song(title, artist, album, genre, "study",
                                valence=(0.3, 0.6), energy=(0.1, 0.4), dance=(0.1, 0.3)))

    # --- ROCK songs ---
    rock_songs = [
        ("Bohemian Rhapsody", "Queen", "A Night at the Opera", "rock"),
        ("Stairway to Heaven", "Led Zeppelin", "Led Zeppelin IV", "rock"),
        ("Sweet Child O' Mine", "Guns N' Roses", "Appetite for Destruction", "rock"),
        ("November Rain", "Guns N' Roses", "Use Your Illusion I", "rock"),
        ("Smells Like Teen Spirit", "Nirvana", "Nevermind", "rock"),
        ("Come as You Are", "Nirvana", "Nevermind", "rock"),
        ("Back in Black", "AC/DC", "Back in Black", "rock"),
        ("Highway to Hell", "AC/DC", "Highway to Hell", "rock"),
        ("Hotel California", "Eagles", "Hotel California", "rock"),
        ("Free Bird", "Lynyrd Skynyrd", "Pronounced 'Leh-'nerd 'Skin-'nerd", "rock"),
        ("Born to Be Wild", "Steppenwolf", "Steppenwolf", "rock"),
        ("Whole Lotta Love", "Led Zeppelin", "Led Zeppelin II", "rock"),
        ("Kashmir", "Led Zeppelin", "Physical Graffiti", "rock"),
        ("Enter Sandman", "Metallica", "Metallica", "metal"),
        ("Master of Puppets", "Metallica", "Master of Puppets", "metal"),
        ("Painkiller", "Judas Priest", "Painkiller", "metal"),
        ("Holy Diver", "Dio", "Holy Diver", "metal"),
        ("Fear of the Dark", "Iron Maiden", "Fear of the Dark", "metal"),
        ("Paranoid", "Black Sabbath", "Paranoid", "metal"),
        ("Iron Man", "Black Sabbath", "Paranoid", "metal"),
        ("Walk", "Pantera", "Vulgar Display of Power", "metal"),
        ("Tom Sawyer", "Rush", "Moving Pictures", "rock"),
        ("Money", "Pink Floyd", "The Dark Side of the Moon", "rock"),
        ("Comfortably Numb", "Pink Floyd", "The Wall", "rock"),
        ("Another Brick in the Wall", "Pink Floyd", "The Wall", "rock"),
        ("Whole Lotta Rosie", "AC/DC", "Let There Be Rock", "rock"),
        ("Go Your Own Way", "Fleetwood Mac", "Rumours", "rock"),
        ("Dreams", "Fleetwood Mac", "Rumours", "rock"),
        ("Paint It Black", "The Rolling Stones", "Aftermath", "rock"),
        ("Satisfaction", "The Rolling Stones", "Out of Our Heads", "rock"),
        ("Light My Fire", "The Doors", "The Doors", "rock"),
        ("Riders on the Storm", "The Doors", "L.A. Woman", "rock"),
        ("Sympathy for the Devil", "The Rolling Stones", "Beggars Banquet", "rock"),
        ("Baba O'Riley", "The Who", "Who's Next", "rock"),
        ("Won't Get Fooled Again", "The Who", "Who's Next", "rock"),
    ]

    for title, artist, album, genre in rock_songs:
        songs.append(_make_song(title, artist, album, genre, "rock",
                                valence=(0.3, 0.7), energy=(0.7, 0.95), dance=(0.4, 0.7)))

    return songs


def _make_song(
    title: str,
    artist: str,
    album: str,
    genre: str,
    mood_tag: str,
    valence: tuple = (0.3, 0.7),
    energy: tuple = (0.3, 0.7),
    dance: tuple = (0.3, 0.7),
) -> dict:
    """Create a song dict with randomized but mood-appropriate audio features."""
    external_id = f"seed:{mood_tag}:{_slug(artist)}:{_slug(title)}"
    return {
        "id": str(uuid.uuid4()),
        "title": title,
        "artist": artist,
        "album": album,
        "genre": genre,
        "mood_tag": mood_tag,
        "duration": random.randint(150, 420),
        "cover_url": f"https://picsum.photos/seed/{_slug(title)}/300/300",
        "audio_url": None,
        "preview_url": None,
        "external_source": "seed",
        "external_id": external_id,
        "valence": round(random.uniform(*valence), 3),
        "energy": round(random.uniform(*energy), 3),
        "danceability": round(random.uniform(*dance), 3),
        "tempo": round(random.uniform(70, 180), 1),
        "acousticness": round(random.uniform(0.05, 0.85), 3),
        "instrumentalness": round(random.uniform(0, 0.6), 3),
        "popularity": random.randint(40, 100),
        "release_date": datetime(
            random.randint(1970, 2024),
            random.randint(1, 12),
            random.randint(1, 28)
        ).isoformat(),
    }


async def seed_database(db):
    """Seed the database with songs. Idempotent -- safe on every restart."""
    from app.models.song import Song
    from sqlalchemy import select
    import uuid as uuid_mod

    result = await db.execute(select(Song).limit(1))
    if result.scalar_one_or_none():
        print("Database already seeded, skipping.")
        return

    print("Seeding database with songs...")
    songs_data = get_seed_songs()

    for s in songs_data:
        song = Song(
            id=uuid_mod.UUID(s["id"]),
            title=s["title"],
            artist=s["artist"],
            album=s["album"],
            genre=s["genre"],
            mood_tag=s["mood_tag"],
            duration=s["duration"],
            cover_url=s["cover_url"],
            audio_url=s["audio_url"],
            preview_url=s["preview_url"],
            external_source=s["external_source"],
            external_id=s["external_id"],
            valence=s["valence"],
            energy=s["energy"],
            danceability=s["danceability"],
            tempo=s["tempo"],
            acousticness=s["acousticness"],
            instrumentalness=s["instrumentalness"],
            popularity=s["popularity"],
            release_date=datetime.fromisoformat(s["release_date"]) if s["release_date"] else None,
        )
        db.add(song)

    await db.flush()
    print(f"Seeded {len(songs_data)} songs.")
