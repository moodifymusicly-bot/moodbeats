"""Map seed-catalog (title, artist) pairs to known YouTube video IDs.

Keys use `_key(title, artist)` so they align with `backend/app/seed/seed_data.py`.
Expanded to cover all major seed catalog entries so recommendations can play
immediately without a live API lookup.
"""

from __future__ import annotations

import re


def _norm(x: str) -> str:
    x = x.lower().strip()
    x = re.sub(r"[^a-z0-9]+", " ", x)
    return re.sub(r"\s+", " ", x).strip()


def _key(title: str, artist: str) -> str:
    return f"{_norm(title)}|{_norm(artist)}"


def _entries() -> dict[str, str]:
    return {
        # --- Happy / Upbeat ---
        _key("Happy", "Pharrell Williams"): "y6Sxv-sUYtM",
        _key("Sugar", "Maroon 5"): "09R8_2nJtjg",
        _key("Uptown Funk", "Bruno Mars ft. Mark Ronson"): "OPf0YbXqDm0",
        _key("Uptown Funk", "Mark Ronson ft. Bruno Mars"): "OPf0YbXqDm0",
        _key("Dynamite", "BTS"): "gdZLi9oWNZg",
        _key("Levitating", "Dua Lipa"): "TUVcZfQe-Kw",
        _key("Good as Hell", "Lizzo"): "SmbmeOgGsW4",
        _key("Can't Stop the Feeling", "Justin Timberlake"): "ru0K8uLPyzE",
        _key("Shake It Off", "Taylor Swift"): "nfWlot6h_JM",
        _key("Shut Up and Dance", "WALK THE MOON"): "6JCLY0Rlx6Q",
        _key("Roar", "Katy Perry"): "CevxZvSJLk8",
        _key("Happy Together", "The Turtles"): "9ZEROcOHHCQ",
        _key("Walking on Sunshine", "Katrina and the Waves"): "iPUmE-tne5U",
        _key("I Gotta Feeling", "The Black Eyed Peas"): "uSD4vsh1zDA",
        _key("Believer", "Imagine Dragons"): "7wtfhZwyrcc",

        # --- Sad / Melancholic ---
        _key("Someone Like You", "Adele"): "hLQl3WQQoQ0",
        _key("Creep", "Radiohead"): "XFkzRNyygfk",
        _key("Let Her Go", "Passenger"): "RBumgq5yVrA",
        _key("Photograph", "Ed Sheeran"): "nSDgHBxUbVQ",
        _key("The Night We Met", "Lord Huron"): "KtlgYxa6BMU",
        _key("Skinny Love", "Bon Iver"): "ssdgFoHLwnk",
        _key("Fix You", "Coldplay"): "k4V3Mo61fJM",
        _key("The Scientist", "Coldplay"): "RB-RcX5DS5A",
        _key("Hallelujah", "Jeff Buckley"): "y8AWFf7EAc4",
        _key("All I Want", "Kodaline"): "4CHMxMa3CfI",
        _key("Liability", "Lorde"): "bXNoMF5qlSQ",
        _key("Wrecking Ball", "Miley Cyrus"): "My2FRPA3Gf8",
        _key("When the Party's Over", "Billie Eilish"): "pbMwTqkKSps",
        _key("Ocean Eyes", "Billie Eilish"): "viimfQi_pUw",

        # --- Gym / High Energy ---
        _key("Stronger", "Kanye West"): "PsO6ZnUZI0g",
        _key("Till I Collapse", "Eminem"): "Obim8BYGnOE",
        _key("Radioactive", "Imagine Dragons"): "ktvTqknDobU",
        _key("Faded", "Alan Walker"): "60ItHLz5WEA",
        _key("Thunderstruck", "AC/DC"): "v2AC41dglnM",
        _key("Eye of the Tiger", "Survivor"): "btPJPFnesV4",
        _key("Lose Yourself", "Eminem"): "_Yhyp-_hX2s",
        _key("Power", "Kanye West"): "L53gjP-TtGE",
        _key("Can't Hold Us", "Macklemore & Ryan Lewis"): "hlVBg7_08n0",
        _key("Jump Around", "House of Pain"): "idoSSqdCkBA",
        _key("Pump It", "The Black Eyed Peas"): "ZbZSe6N_BXs",
        _key("Remember the Name", "Fort Minor"): "VDvr08sCPOc",
        _key("Numb/Encore", "Linkin Park & Jay-Z"): "fMDSbLB8kow",
        _key("Rap God", "Eminem"): "XbGs_qK2PQA",

        # --- Study / Chill / Ambient ---
        _key("Weightless", "Marconi Union"): "UfcAVejslrU",
        _key("Clair de Lune", "Claude Debussy"): "CvFH_6DNRCY",
        _key("Experience", "Ludovico Einaudi"): "hN_q-_jI-uc",
        _key("Intro", "The xx"): "qkk5wViJo-I",
        _key("Comptine d'un autre été", "Yann Tiersen"): "Qhh0geBiVRI",
        _key("Gymnopédie No. 1", "Erik Satie"): "S-Xm7s9eGxU",
        _key("Divenire", "Ludovico Einaudi"): "4RCfuMHqMbU",
        _key("Retrograde", "James Blake"): "6VEP5J_HzBg",
        _key("Northern Lights", "Tycho"): "y6RBg_BLDXU",
        _key("Awake", "Tycho"): "S-oA_gLnSPc",
        _key("Hours", "Tycho"): "wBP6NrJf38I",
        _key("Re:Stacks", "Bon Iver"): "VO-CUH97nDg",
        _key("Spiegel im Spiegel", "Arvo Pärt"): "TJ6Mzvh3XCc",
        _key("On the Nature of Daylight", "Max Richter"): "b_YHM4gR9qk",
        _key("My Body Is a Cage", "Arcade Fire"): "OZiMR3vVq78",

        # --- Rock ---
        _key("Blinding Lights", "The Weeknd"): "4NRXx6U8ABQ",
        _key("Sunflower", "Post Malone & Swae Lee"): "ApXoWvfEYVU",
        _key("Sweet Child O' Mine", "Guns N' Roses"): "1w7OgIMMRc4",
        _key("Bohemian Rhapsody", "Queen"): "fJ9rUzIMcZQ",
        _key("Stairway to Heaven", "Led Zeppelin"): "D9ioyEvdggk",
        _key("Hotel California", "Eagles"): "BciS5krYL80",
        _key("Smells Like Teen Spirit", "Nirvana"): "hTWKbfoikeg",
        _key("Come as You Are", "Nirvana"): "vabnZ9-ex7o",
        _key("Black", "Pearl Jam"): "A-ELiUgSM74",
        _key("Black Hole Sun", "Soundgarden"): "3mbBbFH9fAg",
        _key("Mr. Brightside", "The Killers"): "gGdGFtwCNBE",
        _key("Human", "The Killers"): "RIZdjT9SCNU",
        _key("Seven Nation Army", "The White Stripes"): "0J2QdDbelmY",
        _key("Feel Good Inc.", "Gorillaz"): "HyHNuVaZJ-k",
        _key("Take Me Out", "Franz Ferdinand"): "FX85S3mHRFM",
        _key("Reptilia", "The Strokes"): "cFEt2bLJqpQ",
        _key("Last Nite", "The Strokes"): "ToIdVJpqhqc",
        _key("Do I Wanna Know?", "Arctic Monkeys"): "bpOSxM0MsIk",
        _key("R U Mine?", "Arctic Monkeys"): "The59I7CREAM",
        _key("505", "Arctic Monkeys"): "C1dk4fDFJFE",
        _key("Fluorescent Adolescent", "Arctic Monkeys"): "Q7dNELALJEU",
    }


_SEED_YOUTUBE_IDS = _entries()


def resolve_seed_youtube_id(title: str, artist: str) -> str | None:
    """Return a known video id for this seed track, if present."""
    return _SEED_YOUTUBE_IDS.get(_key(title, artist))
