import os
import json
import base64
from tinytag import TinyTag

music_dir = "music"
music_data = {}
other_songs = []

# Filter artists with 3 or fewer tracks into "Other"
THRESHOLD = 3 

if os.path.exists(music_dir):
    for filename in os.listdir(music_dir):
        if filename.lower().endswith('.mp3'):
            file_path = os.path.join(music_dir, filename)
            try:
                # Load images safely without generating deprecation warnings
                tag = TinyTag.get(file_path, image=True)
                artist = tag.artist if tag.artist else "Unknown Artist"
                title = tag.title if tag.title else filename.replace('.mp3', '')
                
                # Check for image explicitly using non-None validation
                album_art_url = ""
                if tag.images.any is not None:
                    img_obj = tag.images.any
                    b64_data = base64.b64encode(img_obj.data).decode('utf-8')
                    album_art_url = f"data:{img_obj.mime_type};base64,{b64_data}"
            except Exception:
                artist = "Unknown Artist"
                title = filename.replace('.mp3', '')
                album_art_url = ""
            
            track_obj = {
                "title": title,
                "audioUrl": f"music/{filename}",
                "image": album_art_url
            }
            
            if artist not in music_data:
                music_data[artist] = []
            music_data[artist].append(track_obj)

primary_artists = []

for artist, songs in music_data.items():
    if len(songs) <= THRESHOLD:
        for s in songs:
            s["originalArtist"] = artist
        other_songs.extend(songs)
    else:
        primary_artists.append({
            "artist": artist,
            "songs": songs
        })

primary_artists.sort(key=lambda x: len(x["songs"]), reverse=True)

if other_songs:
    primary_artists.append({
        "artist": "Other",
        "songs": other_songs
    })

js_content = f"const musicData = {json.dumps(primary_artists, indent=2)};"

with open("script.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

cutoff = 0
for i, line in enumerate(lines):
    if "let flatPlaylist =" in line:
        cutoff = i
        break

player_logic = "".join(lines[cutoff:])

with open("script.js", "w", encoding="utf-8") as f:
    f.write(js_content + "\n\n" + player_logic)

print("⚡ musik: Embedded Album Art compiled & Synced flawlessly!")
