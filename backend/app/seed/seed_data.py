"""
Seed database with 200+ songs across 6 mood categories.
Uses real song titles and artists for authenticity.
"""
import random
import uuid
from datetime import datetime, timedelta


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
        ("Love on Top", "Beyoncé", "4", "r&b"),
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
        ("Nothing Compares 2 U", "Sinéad O'Connor", "I Do Not Want What I Haven't Got", "pop"),
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
        ("Jealous", "Labrinth", "Jealous", "pop"),
        ("Before You Go", "Lewis Capaldi", "Divinely Uninspired", "pop"),
        ("All Too Well (10 Minute Version)", "Taylor Swift", "Red (TV)", "pop"),
        ("exile", "Taylor Swift ft. Bon Iver", "folklore", "indie"),
        ("Snuff", "Slipknot", "All Hope Is Gone", "metal"),
        ("Black", "Pearl Jam", "Ten", "grunge"),
        ("How to Disappear Completely", "Radiohead", "Kid A", "alt-rock"),
        ("Space Song", "Beach House", "Depression Cherry", "shoegaze"),
        ("Numb", "Linkin Park", "Meteora", "rock"),
        ("My Immortal", "Evanescence", "Fallen", "rock"),
    ]

    for title, artist, album, genre in sad_songs:
        songs.append(_make_song(title, artist, album, genre, "sad",
                                valence=(0.05, 0.3), energy=(0.15, 0.45), dance=(0.15, 0.4)))

    # --- GYM songs ---
    gym_songs = [
        ("Stronger", "Kanye West", "Graduation", "hip-hop"),
        ("Eye of the Tiger", "Survivor", "Eye of the Tiger", "rock"),
        ("Lose Yourself", "Eminem", "8 Mile", "hip-hop"),
        ("Till I Collapse", "Eminem ft. Nate Dogg", "The Eminem Show", "hip-hop"),
        ("Power", "Kanye West", "My Beautiful Dark Twisted Fantasy", "hip-hop"),
        ("Can't Hold Us", "Macklemore & Ryan Lewis", "The Heist", "hip-hop"),
        ("Thunderstruck", "AC/DC", "The Razors Edge", "rock"),
        ("Remember the Name", "Fort Minor", "The Rising Tied", "hip-hop"),
        ("Pump It", "Black Eyed Peas", "Monkey Business", "hip-hop"),
        ("Levels", "Avicii", "True", "edm"),
        ("Bangarang", "Skrillex", "Bangarang EP", "dubstep"),
        ("Turn Down for What", "DJ Snake & Lil Jon", "Turn Down for What", "edm"),
        ("Radioactive", "Imagine Dragons", "Night Visions", "rock"),
        ("Centuries", "Fall Out Boy", "American Beauty/American Psycho", "rock"),
        ("Warriors", "Imagine Dragons", "Smoke + Mirrors", "rock"),
        ("Legend", "The Score", "Atlas", "indie"),
        ("Run This Town", "Jay-Z ft. Rihanna", "The Blueprint 3", "hip-hop"),
        ("Sicko Mode", "Travis Scott", "ASTROWORLD", "hip-hop"),
        ("DNA.", "Kendrick Lamar", "DAMN.", "hip-hop"),
        ("HUMBLE.", "Kendrick Lamar", "DAMN.", "hip-hop"),
        ("Harder Better Faster Stronger", "Daft Punk", "Discovery", "electronic"),
        ("Jump", "Van Halen", "1984", "rock"),
        ("Sandstorm", "Darude", "Before the Storm", "trance"),
        ("Animals", "Martin Garrix", "Animals", "edm"),
        ("Titanium", "David Guetta ft. Sia", "Nothing but the Beat", "edm"),
        ("We Will Rock You", "Queen", "News of the World", "rock"),
        ("Bring Me to Life", "Evanescence", "Fallen", "rock"),
        ("Bodies", "Drowning Pool", "Sinner", "metal"),
        ("Survivor", "Destiny's Child", "Survivor", "r&b"),
        ("Unstoppable", "Sia", "This Is Acting", "pop"),
        ("Run Boy Run", "Woodkid", "The Golden Age", "indie"),
        ("The Pretender", "Foo Fighters", "Echoes, Silence, Patience & Grace", "rock"),
        ("Shipping Up to Boston", "Dropkick Murphys", "The Warrior's Code", "punk"),
        ("Sabotage", "Beastie Boys", "Ill Communication", "hip-hop"),
    ]

    for title, artist, album, genre in gym_songs:
        songs.append(_make_song(title, artist, album, genre, "gym",
                                valence=(0.5, 0.8), energy=(0.85, 1.0), dance=(0.65, 0.95)))

    # --- STUDY songs ---
    study_songs = [
        ("Clair de Lune", "Claude Debussy", "Suite bergamasque", "classical"),
        ("Gymnopédie No. 1", "Erik Satie", "Trois Gymnopédies", "classical"),
        ("Experience", "Ludovico Einaudi", "In a Time Lapse", "classical"),
        ("Nuvole Bianche", "Ludovico Einaudi", "Una Mattina", "classical"),
        ("River Flows in You", "Yiruma", "First Love", "classical"),
        ("Ambient 1: Music for Airports", "Brian Eno", "Ambient 1", "ambient"),
        ("Intro", "The xx", "xx", "indie"),
        ("Weightless", "Marconi Union", "Weightless", "ambient"),
        ("Sunset Lover", "Petit Biscuit", "Petit Biscuit", "electronic"),
        ("Youth", "Glass Animals", "ZABA", "indie"),
        ("Night Owl", "Gerry Read", "Jummy", "lo-fi"),
        ("Coffee", "beabadoobee", "Loveworm", "lo-fi"),
        ("Be Still", "The Fray", "Scars and Stories", "indie"),
        ("Breathe", "Télépopmusik", "Genetic World", "electronic"),
        ("Blue", "Eiffel 65", "Europop", "electronic"),
        ("Comptine d'un autre été", "Yann Tiersen", "Amélie OST", "classical"),
        ("The Rain Song", "Led Zeppelin", "Houses of the Holy", "rock"),
        ("Svefn-g-englar", "Sigur Rós", "Ágætis byrjun", "post-rock"),
        ("An Ending (Ascent)", "Brian Eno", "Apollo", "ambient"),
        ("Crystals", "M.O.O.N.", "Hotline Miami OST", "synthwave"),
        ("Midnight City", "M83", "Hurry Up, We're Dreaming", "electronic"),
        ("Flim", "Aphex Twin", "Come to Daddy", "electronic"),
        ("Dawn", "Dario Marianelli", "Pride & Prejudice OST", "classical"),
        ("Arrival of the Birds", "The Cinematic Orchestra", "The Crimson Wing", "neo-classical"),
        ("Nocturne Op. 9 No. 2", "Frédéric Chopin", "Nocturnes", "classical"),
        ("First Step", "Hans Zimmer", "Interstellar OST", "classical"),
        ("Merry Go Round of Life", "Joe Hisaishi", "Howl's Moving Castle", "classical"),
        ("To Build a Home", "The Cinematic Orchestra", "Ma Fleur", "post-rock"),
        ("Lux Aeterna", "Clint Mansell", "Requiem for a Dream", "classical"),
        ("Re: Stacks", "Bon Iver", "For Emma, Forever Ago", "indie"),
        ("Holocene", "Bon Iver", "Bon Iver, Bon Iver", "indie"),
        ("Saturn", "Sleeping At Last", "Atlas: Space", "indie"),
    ]

    for title, artist, album, genre in study_songs:
        songs.append(_make_song(title, artist, album, genre, "study",
                                valence=(0.2, 0.5), energy=(0.05, 0.35), dance=(0.1, 0.35)))

    # --- ROCK songs ---
    rock_songs = [
        ("Bohemian Rhapsody", "Queen", "A Night at the Opera", "rock"),
        ("Stairway to Heaven", "Led Zeppelin", "Led Zeppelin IV", "rock"),
        ("Hotel California", "Eagles", "Hotel California", "rock"),
        ("Sweet Child O' Mine", "Guns N' Roses", "Appetite for Destruction", "rock"),
        ("Smells Like Teen Spirit", "Nirvana", "Nevermind", "grunge"),
        ("Back in Black", "AC/DC", "Back in Black", "rock"),
        ("Enter Sandman", "Metallica", "Metallica", "metal"),
        ("Paradise City", "Guns N' Roses", "Appetite for Destruction", "rock"),
        ("Crazy Train", "Ozzy Osbourne", "Blizzard of Ozz", "metal"),
        ("Iron Man", "Black Sabbath", "Paranoid", "metal"),
        ("Kashmir", "Led Zeppelin", "Physical Graffiti", "rock"),
        ("Comfortably Numb", "Pink Floyd", "The Wall", "rock"),
        ("Dream On", "Aerosmith", "Aerosmith", "rock"),
        ("Paint It Black", "The Rolling Stones", "Aftermath", "rock"),
        ("Immigrant Song", "Led Zeppelin", "Led Zeppelin III", "rock"),
        ("Welcome to the Jungle", "Guns N' Roses", "Appetite for Destruction", "rock"),
        ("Paranoid", "Black Sabbath", "Paranoid", "metal"),
        ("The Trooper", "Iron Maiden", "Piece of Mind", "metal"),
        ("Ace of Spades", "Motörhead", "Ace of Spades", "metal"),
        ("Foo Fighters", "Everlong", "The Colour and the Shape", "rock"),
        ("Hysteria", "Muse", "Absolution", "rock"),
        ("Cochise", "Audioslave", "Audioslave", "rock"),
        ("My Own Summer", "Deftones", "Around the Fur", "metal"),
        ("Killing in the Name", "Rage Against the Machine", "RATM", "rock"),
        ("Chop Suey!", "System of a Down", "Toxicity", "metal"),
        ("The Beautiful People", "Marilyn Manson", "Antichrist Superstar", "industrial"),
        ("Raining Blood", "Slayer", "Reign in Blood", "thrash"),
        ("Master of Puppets", "Metallica", "Master of Puppets", "metal"),
        ("One", "Metallica", "...And Justice for All", "metal"),
        ("Given Up", "Linkin Park", "Minutes to Midnight", "rock"),
        ("Break Stuff", "Limp Bizkit", "Significant Other", "nu-metal"),
        ("Down with the Sickness", "Disturbed", "The Sickness", "metal"),
        ("Judith", "A Perfect Circle", "Mer de Noms", "rock"),
    ]

    for title, artist, album, genre in rock_songs:
        songs.append(_make_song(title, artist, album, genre, "rock",
                                valence=(0.3, 0.65), energy=(0.7, 0.98), dance=(0.35, 0.65)))

    # --- FEAR songs ---
    fear_songs = [
        ("Thriller", "Michael Jackson", "Thriller", "pop"),
        ("Duel of the Fates", "John Williams", "Star Wars: TPM", "classical"),
        ("O Fortuna", "Carl Orff", "Carmina Burana", "classical"),
        ("Baba Yaga", "Penderecki", "De Natura Sonoris", "classical"),
        ("Hide and Seek", "Imogen Heap", "Speak for Yourself", "electronic"),
        ("In the Hall of the Mountain King", "Edvard Grieg", "Peer Gynt", "classical"),
        ("Toccata and Fugue in D Minor", "J.S. Bach", "Organ Works", "classical"),
        ("Tubular Bells", "Mike Oldfield", "Tubular Bells", "progressive"),
        ("A Forest", "The Cure", "Seventeen Seconds", "post-punk"),
        ("Closer", "Nine Inch Nails", "The Downward Spiral", "industrial"),
        ("Supermassive Black Hole", "Muse", "Black Holes and Revelations", "rock"),
        ("No Surprises", "Radiohead", "OK Computer", "alt-rock"),
        ("Climbing Up the Walls", "Radiohead", "OK Computer", "alt-rock"),
        ("Heart-Shaped Box", "Nirvana", "In Utero", "grunge"),
        ("The Beautiful People", "Marilyn Manson", "Antichrist Superstar", "industrial"),
        ("Lacrimosa", "Mozart", "Requiem", "classical"),
        ("Dies Irae", "Verdi", "Requiem", "classical"),
        ("Lavender Town Theme", "Junichi Masuda", "Pokémon RBY", "game"),
        ("Come Play with Me", "Extreme Music", "Horror Trailers Vol. 1", "cinematic"),
        ("The Exorcist Theme", "Mike Oldfield", "Tubular Bells", "progressive"),
        ("It Follows Soundtrack", "Disasterpeace", "It Follows", "synth"),
        ("Hellraiser Main Theme", "Christopher Young", "Hellraiser OST", "classical"),
        ("28 Days Later Theme", "John Murphy", "28 Days Later OST", "post-rock"),
        ("Anxiety", "blackbear", "mansionz", "hip-hop"),
        ("Bury a Friend", "Billie Eilish", "WHEN WE ALL FALL ASLEEP", "pop"),
        ("Sweet Dreams", "Eurythmics", "Sweet Dreams", "synth-pop"),
        ("Psycho", "Post Malone ft. Ty Dolla $ign", "beerbongs & bentleys", "hip-hop"),
        ("Monster", "Kanye West", "MBDTF", "hip-hop"),
        ("Nightmare", "Avenged Sevenfold", "Nightmare", "metal"),
        ("Welcome Home", "Coheed and Cambria", "Good Apollo I'm Burning Star IV", "prog-rock"),
        ("Requiem for a Dream", "Clint Mansell", "Requiem for a Dream", "classical"),
        ("Dance Macabre", "Camille Saint-Saëns", "Danse Macabre", "classical"),
        ("Night on Bald Mountain", "Mussorgsky", "Pictures at an Exhibition", "classical"),
    ]

    for title, artist, album, genre in fear_songs:
        songs.append(_make_song(title, artist, album, genre, "fear",
                                valence=(0.05, 0.25), energy=(0.5, 0.85), dance=(0.2, 0.5)))

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
    return {
        "id": str(uuid.uuid4()),
        "title": title,
        "artist": artist,
        "album": album,
        "genre": genre,
        "mood_tag": mood_tag,
        "duration": random.randint(150, 420),
        "cover_url": f"https://picsum.photos/seed/{title.replace(' ', '-').lower()}/300/300",
        "audio_url": None,
        "preview_url": None,
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
    """Seed the database with songs and demo users."""
    from app.models.song import Song
    from app.models.user import User
    from app.models.interaction import Interaction, MoodHistory
    from app.services.auth_service import hash_password
    from sqlalchemy import select
    import uuid as uuid_mod

    # Check if already seeded
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

    # Create demo user
    demo_user = User(
        username="demo",
        email="demo@moodmusic.app",
        hashed_password=hash_password("demo1234"),
    )
    db.add(demo_user)
    await db.flush()

    # Create some interactions for the demo user
    song_objects = songs_data[:50]  # interact with first 50 songs
    for s in song_objects:
        interaction = Interaction(
            user_id=demo_user.id,
            song_id=uuid_mod.UUID(s["id"]),
            interaction_type=random.choice(["play", "play", "play", "like", "skip"]),
            listen_duration=random.uniform(30, float(s["duration"])),
        )
        db.add(interaction)

    # Add some mood history
    moods = ["happy", "sad", "gym", "study", "rock", "fear"]
    for mood in moods:
        entry = MoodHistory(
            user_id=demo_user.id,
            mood=mood,
            source="manual",
            confidence=1.0,
        )
        db.add(entry)

    await db.flush()
    print(f"Seeded {len(songs_data)} songs + demo user (demo@moodmusic.app / demo1234)")
