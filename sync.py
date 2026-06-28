import os
import json
import hashlib
from tinytag import TinyTag

music_dir = "music"
images_dir = "images/covers"
music_data = {}
other_songs = []
THRESHOLD = 3 

# Ensure the images directory exists
os.makedirs(images_dir, exist_ok=True)

if os.path.exists(music_dir):
    for filename in os.listdir(music_dir):
        if filename.lower().endswith('.mp3'):
            file_path = os.path.join(music_dir, filename)
            try:
                tag = TinyTag.get(file_path, image=True)
                artist = tag.artist if tag.artist else "Unknown Artist"
                title = tag.title if tag.title else filename.replace('.mp3', '')
                
                album_art_url = ""
                if tag.images.any is not None:
                    img_obj = tag.images.any
                    # Create unique filename
                    img_hash = hashlib.md5(img_obj.data).hexdigest()
                    ext = ".png" if "png" in img_obj.mime_type else ".jpg"
                    img_filename = f"{img_hash}{ext}"
                    img_path = os.path.join(images_dir, img_filename)
                    
                    # Save the physical image file
                    if not os.path.exists(img_path):
                        with open(img_path, "wb") as img_file:
                            img_file.write(img_obj.data)
                    
                    # Use web-safe forward slashes
                    album_art_url = f"images/covers/{img_filename}"
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
        primary_artists.append({"artist": artist, "songs": songs})

primary_artists.sort(key=lambda x: len(x["songs"]), reverse=True)
if other_songs:
    primary_artists.append({"artist": "Other", "songs": other_songs})

with open("music_data.json", "w", encoding="utf-8") as f:
    json.dump(primary_artists, f, indent=2)

print("⚡ Success: music_data.json and images/ folder updated!")