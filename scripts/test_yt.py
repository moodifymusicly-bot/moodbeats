import os
import urllib.request
import urllib.parse
import json

def test_youtube():
    # rudimentary dotenv load
    with open(".env", "r") as f:
        for line in f:
            if line.startswith("YOUTUBE_API_KEY="):
                os.environ["YOUTUBE_API_KEY"] = line.strip().split("=", 1)[1]
    
    api_key = os.getenv("YOUTUBE_API_KEY")
    if not api_key:
        print("No YOUTUBE_API_KEY found in .env")
        return
        
    url = f"https://www.googleapis.com/youtube/v3/search?part=snippet&q=music&type=video&maxResults=1&key={api_key}"
    
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            if response.status == 200:
                print("SUCCESS: YouTube API Key is valid and working.")
                data = json.loads(response.read().decode())
                items = data.get("items", [])
                if items:
                    print(f"Found video: {items[0]['snippet']['title']}")
            else:
                print(f"ERROR: {response.status}")
    except urllib.error.HTTPError as e:
        print(f"ERROR: {e.code}")
        print(e.read().decode())
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    test_youtube()
