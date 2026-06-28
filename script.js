let musicData = [];
let flatPlaylist = [];

let currentArtistIndex = 0;
let currentlyPlayingTrack = null;
let isShuffle = false;
let isRepeat = false;
let isDragging = false;

let favoritedUrls = JSON.parse(localStorage.getItem('musik_favorites')) || [];
let customPlaylists = JSON.parse(localStorage.getItem('musik_custom_playlists')) || {};
let shuffleHistory = [];
let pendingTrackUrl = null;
let playlistPendingDeletion = null;

// DOM Links
const deletePlaylistModal = document.getElementById('delete-playlist-modal');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const deleteModalWarningText = document.getElementById('delete-modal-warning-text');
const track = document.getElementById('artist-track');
const songsListContainer = document.getElementById('songs-list');
const artistHeading = document.getElementById('current-artist-heading');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const audioElement = document.getElementById('audio-element');
const playPauseBtn = document.getElementById('play-pause-btn');
const controlTitle = document.getElementById('control-title');
const controlArtist = document.getElementById('control-artist');
const timeDisplay = document.getElementById('time-display');
const timelineSlider = document.getElementById('timeline-slider');
const volumeSlider = document.getElementById('volume-slider');
const indShuf = document.getElementById('ind-shuf');
const indRep = document.getElementById('ind-rep');
const shuffleBtn = document.getElementById('shuffle-btn');
const repeatBtn = document.getElementById('repeat-btn');
const nextTrackBtn = document.getElementById('next-track-btn');
const prevTrackBtn = document.getElementById('prev-track-btn');
const themeSelect = document.getElementById('theme-select');
const createPlaylistBtn = document.getElementById('create-playlist-btn');
const playlistModal = document.getElementById('playlist-modal');
const newPlaylistInput = document.getElementById('new-playlist-input');
const savePlaylistBtn = document.getElementById('save-playlist-btn');
const cancelPlaylistBtn = document.getElementById('cancel-playlist-btn');
const addToPlaylistModal = document.getElementById('add-to-playlist-modal');
const playlistSelectDropdown = document.getElementById('playlist-select-dropdown');
const confirmAddTrackBtn = document.getElementById('confirm-add-track-btn');
const cancelAddTrackBtn = document.getElementById('cancel-add-track-btn');

// ─── TIMELINE SLIDER (single, clean implementation) ───────────────────────────

timelineSlider.addEventListener('mousedown', () => { isDragging = true; });
timelineSlider.addEventListener('touchstart', () => { isDragging = true; }, { passive: true });

// While scrubbing: update time display only, don't seek yet
timelineSlider.addEventListener('input', () => {
  if (!audioElement.duration || isNaN(audioElement.duration)) return;
  const previewTime = (timelineSlider.value / 100) * audioElement.duration;
  if (timeDisplay) timeDisplay.textContent = `${formatTime(previewTime)} / ${formatTime(audioElement.duration)}`;
});

// On release: commit the seek
function commitSeek() {
  isDragging = false;
  if (!audioElement.duration || isNaN(audioElement.duration)) return;
  audioElement.currentTime = (timelineSlider.value / 100) * audioElement.duration;
}
timelineSlider.addEventListener('mouseup', commitSeek);
timelineSlider.addEventListener('touchend', commitSeek);

// timeupdate: keep slider in sync while playing (skips when user is dragging)
audioElement.addEventListener('timeupdate', () => {
  if (isDragging || !audioElement.duration || isNaN(audioElement.duration)) return;
  timelineSlider.value = (audioElement.currentTime / audioElement.duration) * 100;
  if (timeDisplay) timeDisplay.textContent = `${formatTime(audioElement.currentTime)} / ${formatTime(audioElement.duration)}`;
});

audioElement.addEventListener('loadedmetadata', () => {
  if (timeDisplay && !isNaN(audioElement.duration)) {
    timeDisplay.textContent = `00:00 / ${formatTime(audioElement.duration)}`;
  }
  // Reset slider to start when a new track loads
  if (!isDragging) timelineSlider.value = 0;
});

audioElement.addEventListener('ended', () => {
  if (isRepeat) { audioElement.currentTime = 0; audioElement.play(); }
  else { skipTrack(1); }
});

// ─── VOLUME ───────────────────────────────────────────────────────────────────

if (volumeSlider) volumeSlider.addEventListener('input', () => { audioElement.volume = volumeSlider.value; });

// ─── PLAYBACK CONTROLS ────────────────────────────────────────────────────────

if (playPauseBtn) {
  playPauseBtn.addEventListener('click', () => {
    if (!currentlyPlayingTrack && flatPlaylist.length > 0) { playSong(flatPlaylist[0]); return; }
    if (!currentlyPlayingTrack) return;
    if (audioElement.paused) { audioElement.play(); playPauseBtn.innerHTML = "||"; }
    else { audioElement.pause(); playPauseBtn.innerHTML = "►"; }
  });
}

if (shuffleBtn) {
  shuffleBtn.addEventListener('click', () => {
    isShuffle = !isShuffle;
    shuffleBtn.classList.toggle('active', isShuffle);
    if (indShuf) indShuf.classList.toggle('active', isShuffle);
    shuffleHistory = [];
  });
}

if (repeatBtn) {
  repeatBtn.addEventListener('click', () => {
    isRepeat = !isRepeat;
    repeatBtn.classList.toggle('active', isRepeat);
    if (indRep) indRep.classList.toggle('active', isRepeat);
  });
}

if (nextTrackBtn) nextTrackBtn.addEventListener('click', () => skipTrack(1));
if (prevTrackBtn) prevTrackBtn.addEventListener('click', () => skipTrack(-1));
if (prevBtn) prevBtn.addEventListener('click', (e) => { e.preventDefault(); if (currentArtistIndex > 0) { currentArtistIndex--; updateCarousel(); } });
if (nextBtn) nextBtn.addEventListener('click', (e) => { e.preventDefault(); if (currentArtistIndex < musicData.length - 1) { currentArtistIndex++; updateCarousel(); } });

// ─── BOOT ─────────────────────────────────────────────────────────────────────

async function bootPlayer() {
  try {
    const response = await fetch('music_data.json');
    musicData = await response.json();
    initApp();
  } catch (error) {
    if (controlTitle) controlTitle.textContent = "DATA SYNC ERROR";
    console.error("Could not load music data:", error);
  }
}
bootPlayer();

// ─── INIT ─────────────────────────────────────────────────────────────────────

function initApp() {
  if (!musicData || musicData.length === 0) {
    if (controlTitle) controlTitle.textContent = "RUN SYNC.PY FIRST";
    return;
  }

  flatPlaylist = [];
  musicData.forEach(artistGroup => {
    artistGroup.songs.forEach(song => {
      flatPlaylist.push({
        title: song.title,
        audioUrl: song.audioUrl,
        artistName: artistGroup.artist,
        image: song.image || ""
      });
    });
  });

  const savedTheme = localStorage.getItem('musik_active_theme') || 'dark';
  if (themeSelect) themeSelect.value = savedTheme;
  applySelectedTheme(savedTheme);

  refreshPlaylistsInMenu();
  buildCarouselDOM();
  updateCarousel();
  setupMobileSwipes();
  setupUltraFastTaps();
  setupThemeListeners();

  if (createPlaylistBtn) createPlaylistBtn.addEventListener('click', openPlaylistCreationModal);
}

// ─── PLAYLIST MANAGEMENT ──────────────────────────────────────────────────────

function refreshPlaylistsInMenu() {
  const skipNames = ["My Favorites", "Other"];
  for (let i = musicData.length - 1; i >= 0; i--) {
    if (skipNames.includes(musicData[i].artist) || customPlaylists[musicData[i].artist]) {
      musicData.splice(i, 1);
    }
  }
  Object.keys(customPlaylists).forEach(playlistName => {
    const urls = customPlaylists[playlistName];
    const tracks = flatPlaylist.filter(t => urls.includes(t.audioUrl));
    musicData.unshift({
      artist: playlistName,
      songs: tracks.map(t => ({ title: t.title, audioUrl: t.audioUrl, originalArtist: t.artistName, image: t.image }))
    });
  });
  const favoriteTracks = flatPlaylist.filter(t => favoritedUrls.includes(t.audioUrl));
  if (favoriteTracks.length > 0) {
    musicData.unshift({
      artist: "My Favorites",
      songs: favoriteTracks.map(t => ({ title: t.title, audioUrl: t.audioUrl, originalArtist: t.artistName, image: t.image }))
    });
  }
}

function openPlaylistCreationModal() {
  if (playlistModal) { playlistModal.classList.add('active'); if (newPlaylistInput) newPlaylistInput.focus(); }
}
function closePlaylistCreationModal() {
  if (playlistModal) { playlistModal.classList.remove('active'); if (newPlaylistInput) newPlaylistInput.value = ""; }
}
if (cancelPlaylistBtn) cancelPlaylistBtn.addEventListener('click', closePlaylistCreationModal);
if (savePlaylistBtn) {
  savePlaylistBtn.addEventListener('click', () => {
    if (!newPlaylistInput) return;
    const name = newPlaylistInput.value.trim();
    if (!name) return;
    if (customPlaylists[name] || name === "My Favorites" || name === "Other") { alert("A playlist or artist with that name already exists!"); return; }
    customPlaylists[name] = [];
    localStorage.setItem('musik_custom_playlists', JSON.stringify(customPlaylists));
    closePlaylistCreationModal();
    refreshPlaylistsInMenu();
    buildCarouselDOM();
    currentArtistIndex = musicData.findIndex(m => m.artist === name);
    updateCarousel();
  });
}

function openAddToPlaylistModal(trackUrl) {
  pendingTrackUrl = trackUrl;
  if (!playlistSelectDropdown || !addToPlaylistModal) return;
  playlistSelectDropdown.innerHTML = "";
  const playlists = Object.keys(customPlaylists);
  if (playlists.length === 0) { alert("Please create a custom playlist first using the button at the top!"); return; }
  playlists.forEach(pl => { const opt = document.createElement('option'); opt.value = pl; opt.textContent = pl; playlistSelectDropdown.appendChild(opt); });
  addToPlaylistModal.classList.add('active');
}
function closeAddToPlaylistModal() {
  if (addToPlaylistModal) addToPlaylistModal.classList.remove('active');
  pendingTrackUrl = null;
}
if (cancelAddTrackBtn) cancelAddTrackBtn.addEventListener('click', closeAddToPlaylistModal);
if (confirmAddTrackBtn) {
  confirmAddTrackBtn.addEventListener('click', () => {
    if (!playlistSelectDropdown || !pendingTrackUrl) return;
    const targetPlaylist = playlistSelectDropdown.value;
    if (customPlaylists[targetPlaylist] && !customPlaylists[targetPlaylist].includes(pendingTrackUrl)) {
      customPlaylists[targetPlaylist].push(pendingTrackUrl);
      localStorage.setItem('musik_custom_playlists', JSON.stringify(customPlaylists));
      const currentArtistName = musicData[currentArtistIndex].artist;
      refreshPlaylistsInMenu(); buildCarouselDOM();
      let newIdx = musicData.findIndex(m => m.artist === currentArtistName);
      if (newIdx === -1) newIdx = 0;
      currentArtistIndex = newIdx;
      updateCarousel();
    }
    closeAddToPlaylistModal();
  });
}

function openDeleteConfirmationModal(playlistName) {
  playlistPendingDeletion = playlistName;
  if (deleteModalWarningText) deleteModalWarningText.textContent = `Are you sure you want to permanently delete "${playlistName}"?`;
  if (deletePlaylistModal) deletePlaylistModal.classList.add('active');
}
function closeDeleteConfirmationModal() {
  if (deletePlaylistModal) deletePlaylistModal.classList.remove('active');
  playlistPendingDeletion = null;
}
if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeDeleteConfirmationModal);
if (confirmDeleteBtn) {
  confirmDeleteBtn.addEventListener('click', () => {
    if (!playlistPendingDeletion) return;
    delete customPlaylists[playlistPendingDeletion];
    localStorage.setItem('musik_custom_playlists', JSON.stringify(customPlaylists));
    refreshPlaylistsInMenu(); buildCarouselDOM();
    currentArtistIndex = Math.max(0, Math.min(currentArtistIndex, musicData.length - 1));
    closeDeleteConfirmationModal();
    updateCarousel();
  });
}

function toggleFavorite(url) {
  const index = favoritedUrls.indexOf(url);
  if (index === -1) favoritedUrls.push(url); else favoritedUrls.splice(index, 1);
  localStorage.setItem('musik_favorites', JSON.stringify(favoritedUrls));
  const currentArtistName = musicData[currentArtistIndex].artist;
  refreshPlaylistsInMenu(); buildCarouselDOM();
  let newIdx = musicData.findIndex(m => m.artist === currentArtistName);
  if (newIdx === -1) newIdx = 0;
  currentArtistIndex = newIdx;
  updateCarousel();
}

// ─── CAROUSEL ─────────────────────────────────────────────────────────────────

function buildCarouselDOM() {
  if (!track) return;
  track.innerHTML = '';
  musicData.forEach((data) => {
    const card = document.createElement('div');
    card.classList.add('artist-card');
    const name = document.createElement('h3');
    name.textContent = data.artist;
    card.appendChild(name);
    track.appendChild(card);
  });
}

function updateCarousel() {
  if (musicData.length === 0 || !track) return;
  track.style.transform = `translateX(-${currentArtistIndex * 100}%)`;
  document.querySelectorAll('.artist-card').forEach((card, index) => { card.classList.toggle('active', index === currentArtistIndex); });
  renderSongsList();
}

function setupMobileSwipes() {
  const swipeZone = document.getElementById('swipe-zone');
  if (!swipeZone) return;
  let touchStartX = 0;
  swipeZone.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
  swipeZone.addEventListener('touchend', (e) => {
    const delta = touchStartX - e.changedTouches[0].screenX;
    if (delta > 40 && currentArtistIndex < musicData.length - 1) { currentArtistIndex++; updateCarousel(); }
    else if (delta < -40 && currentArtistIndex > 0) { currentArtistIndex--; updateCarousel(); }
  }, { passive: true });
}

// ─── SONG LIST ────────────────────────────────────────────────────────────────

function renderSongsList() {
  if (!songsListContainer) return;
  const activeArtist = musicData[currentArtistIndex];
  if (!activeArtist) return;
  songsListContainer.innerHTML = '';
  const isCustomPlaylist = customPlaylists[activeArtist.artist] !== undefined;

  if (artistHeading) {
    if (isCustomPlaylist) {
      artistHeading.innerHTML = `DISCOGRAPHY: ${activeArtist.artist.toUpperCase()} <button class="playlist-delete-btn" id="trigger-del-node">Delete</button>`;
      document.getElementById('trigger-del-node').addEventListener('click', (e) => { e.stopPropagation(); openDeleteConfirmationModal(activeArtist.artist); });
    } else {
      artistHeading.textContent = `DISCOGRAPHY: ${activeArtist.artist.toUpperCase()}`;
    }
  }

  activeArtist.songs.forEach((song) => {
    const row = document.createElement('div');
    row.classList.add('song-row');
    if (currentlyPlayingTrack && currentlyPlayingTrack.audioUrl === song.audioUrl) row.classList.add('playing');
    const isFav = favoritedUrls.includes(song.audioUrl);
    let displayTitle = song.title;
    if ((activeArtist.artist === "Other" || activeArtist.artist === "My Favorites" || isCustomPlaylist) && song.originalArtist) {
      displayTitle += ` <small style="color:var(--text-muted); font-size:0.75rem; font-weight:normal; margin-left:4px;">by ${song.originalArtist}</small>`;
    }
    row.innerHTML = `
      <span class="song-title">${displayTitle}</span>
      <div class="song-actions-wrapper">
        <button class="playlist-add-btn" data-url="${song.audioUrl}">＋</button>
        <button class="fav-star-btn ${isFav ? 'is-fav' : ''}" data-url="${song.audioUrl}">★</button>
      </div>
    `;
    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('fav-star-btn')) { toggleFavorite(song.audioUrl); return; }
      if (e.target.classList.contains('playlist-add-btn')) { openAddToPlaylistModal(song.audioUrl); return; }
      const parsedTrack = flatPlaylist.find(t => t.audioUrl === song.audioUrl);
      if (parsedTrack) playSong(parsedTrack);
    });
    songsListContainer.appendChild(row);
  });
}

// ─── PLAYBACK ─────────────────────────────────────────────────────────────────

function playSong(song) {
  if (!audioElement) return;
  currentlyPlayingTrack = song;

  // Reset slider immediately so it doesn't show stale position
  isDragging = false;
  timelineSlider.value = 0;
  if (timeDisplay) timeDisplay.textContent = `00:00 / 00:00`;

  audioElement.src = song.audioUrl;
  audioElement.load(); // Force browser to re-evaluate the new source

  const lcdContainer = document.querySelector('.lcd-display');
  if (lcdContainer) lcdContainer.classList.add('pixel-swap-active');

  setTimeout(() => {
    if (controlTitle) {
      controlTitle.textContent = song.title.toUpperCase();
      controlTitle.classList.remove('scroll-active');
      controlTitle.style.removeProperty('--scroll-distance');
      controlTitle.style.removeProperty('--scroll-duration');
    }
    if (controlArtist) {
      controlArtist.textContent = song.artistName.toUpperCase();
      controlArtist.classList.remove('scroll-active');
      controlArtist.style.removeProperty('--scroll-distance');
      controlArtist.style.removeProperty('--scroll-duration');
    }
    if (lcdContainer) lcdContainer.classList.remove('pixel-swap-active');
    setTimeout(() => {
      [controlTitle, controlArtist].forEach(element => {
        if (!element) return;
        const parentWindow = element.parentElement;
        if (!parentWindow) return;
        const overflowDistance = parentWindow.clientWidth - element.scrollWidth;
        if (overflowDistance < 0) {
          element.style.setProperty('--scroll-distance', `${overflowDistance - 8}px`);
          element.style.setProperty('--scroll-duration', `${Math.max(4, Math.abs(overflowDistance) / 25)}s`);
          element.classList.add('scroll-active');
        }
      });
    }, 50);
  }, 150);

  const artworkPlaceholder = document.getElementById('album-art-thumb');
  if (artworkPlaceholder) {
    if (song.image && song.image !== "") {
      artworkPlaceholder.style.backgroundImage = `url('${song.image}')`;
      artworkPlaceholder.innerHTML = "";
      if (themeSelect && themeSelect.value === 'responsive') {
        extractDominantColorsFromImg(song.image, (primary, secondary, darkBg) => {
          document.documentElement.style.setProperty('--aero-aqua-gradient', `linear-gradient(135deg, ${primary}e6 0%, ${secondary}fa 100%)`);
          document.documentElement.style.setProperty('--aqua-glow', primary);
          document.documentElement.style.setProperty('--mode-active-text', secondary);
          document.documentElement.style.setProperty('--deep-blue-bg', darkBg);
          document.documentElement.style.setProperty('--bg-radial-1', primary);
          document.documentElement.style.setProperty('--bg-radial-2', secondary);
        });
      }
    } else {
      artworkPlaceholder.style.backgroundImage = 'none';
      artworkPlaceholder.innerHTML = "🎵";
      if (themeSelect && themeSelect.value === 'responsive') applySelectedTheme('responsive');
    }
    artworkPlaceholder.classList.add('has-art');
  }

  if (isShuffle && !shuffleHistory.includes(song.audioUrl)) shuffleHistory.push(song.audioUrl);
  renderSongsList();
  audioElement.play();
  if (playPauseBtn) playPauseBtn.innerHTML = "||";
  updateMediaSession(song);
}

function skipTrack(direction) {
  const activeSongsPool = musicData[currentArtistIndex].songs;
  if (!activeSongsPool || activeSongsPool.length === 0) return;
  let nextTrackData = null;

  if (isShuffle) {
    let unplayed = activeSongsPool.filter(s => !shuffleHistory.includes(s.audioUrl));
    if (unplayed.length === 0) { shuffleHistory = []; unplayed = activeSongsPool; }
    if (currentlyPlayingTrack && unplayed.length > 1) unplayed = unplayed.filter(s => s.audioUrl !== currentlyPlayingTrack.audioUrl);
    nextTrackData = unplayed[Math.floor(Math.random() * unplayed.length)];
  } else if (currentlyPlayingTrack) {
    const curIdx = activeSongsPool.findIndex(t => t.audioUrl === currentlyPlayingTrack.audioUrl);
    let newIdx = curIdx + direction;
    if (newIdx >= activeSongsPool.length) newIdx = 0;
    if (newIdx < 0) newIdx = activeSongsPool.length - 1;
    nextTrackData = activeSongsPool[newIdx];
  } else {
    nextTrackData = activeSongsPool[0];
  }

  if (!nextTrackData) return;
  const verifiedTrack = flatPlaylist.find(t => t.audioUrl === nextTrackData.audioUrl);
  if (verifiedTrack) playSong(verifiedTrack);
}

// ─── THEME ────────────────────────────────────────────────────────────────────

function setupThemeListeners() {
  if (!themeSelect) return;
  themeSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    localStorage.setItem('musik_active_theme', val);
    applySelectedTheme(val);
  });
}

function applySelectedTheme(theme) {
  document.body.className = "";
  document.documentElement.style.removeProperty('--aero-aqua-gradient');
  document.documentElement.style.removeProperty('--mode-active-text');
  document.documentElement.style.setProperty('--aqua-glow', '#00f0ff');
  document.documentElement.style.setProperty('--bg-radial-1', '#00bfff');
  document.documentElement.style.setProperty('--bg-radial-2', 'rgba(0, 240, 255, 0.15)');
  document.documentElement.style.setProperty('--deep-blue-bg', '#020d1c');
  if (theme === 'light') { document.body.classList.add('light-theme'); }
  else if (theme !== 'dark' && theme !== 'responsive') { document.body.classList.add(`theme-${theme}`); }
  if (theme === 'responsive') {
    if (currentlyPlayingTrack && currentlyPlayingTrack.image && currentlyPlayingTrack.image !== "") {
      extractDominantColorsFromImg(currentlyPlayingTrack.image, (primary, secondary, darkBg) => {
        document.documentElement.style.setProperty('--aero-aqua-gradient', `linear-gradient(135deg, ${primary}e6 0%, ${secondary}fa 100%)`);
        document.documentElement.style.setProperty('--aqua-glow', primary);
        document.documentElement.style.setProperty('--mode-active-text', secondary);
        document.documentElement.style.setProperty('--deep-blue-bg', darkBg);
        document.documentElement.style.setProperty('--bg-radial-1', primary);
        document.documentElement.style.setProperty('--bg-radial-2', secondary);
      });
    } else {
      document.documentElement.style.setProperty('--aero-aqua-gradient', `linear-gradient(135deg, #1766db 0%, #00f2fe 100%)`);
      document.documentElement.style.setProperty('--aqua-glow', '#00f0ff');
      document.documentElement.style.setProperty('--mode-active-text', '#3bf3ff');
      document.documentElement.style.setProperty('--deep-blue-bg', '#031024');
    }
  }
}

function extractDominantColorsFromImg(imgUrl, callback) {
  const img = new Image();
  img.crossOrigin = "Anonymous";
  img.src = imgUrl;
  img.onload = function () {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 16; canvas.height = 16;
    ctx.drawImage(img, 0, 0, 16, 16);
    try {
      const data = ctx.getImageData(0, 0, 16, 16).data;
      let vibrantColors = [];
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const saturation = max === 0 ? 0 : (max - min) / max;
        const totalBrightness = r + g + b;
        if (saturation > 0.2 && totalBrightness > 100 && totalBrightness < 680) vibrantColors.push({ r, g, b, sat: saturation });
      }
      if (vibrantColors.length < 2) { callback("#00f2fe", "#4facfe", "#020d1c"); return; }
      vibrantColors.sort((a, b) => b.sat - a.sat);
      const prime = vibrantColors[0];
      const primaryHex = `#${prime.r.toString(16).padStart(2, '0')}${prime.g.toString(16).padStart(2, '0')}${prime.b.toString(16).padStart(2, '0')}`;
      let secondaryHex = primaryHex;
      for (let i = 1; i < vibrantColors.length; i++) {
        const sec = vibrantColors[i];
        if (Math.abs(prime.r - sec.r) + Math.abs(prime.g - sec.g) + Math.abs(prime.b - sec.b) > 120) {
          secondaryHex = `#${sec.r.toString(16).padStart(2, '0')}${sec.g.toString(16).padStart(2, '0')}${sec.b.toString(16).padStart(2, '0')}`;
          break;
        }
      }
      if (secondaryHex === primaryHex) secondaryHex = `#${Math.floor(prime.g * 0.7).toString(16).padStart(2, '0')}${Math.floor(prime.b * 1.2).toString(16).padStart(2, '0')}${Math.floor(prime.r * 0.9).toString(16).padStart(2, '0')}`;
      const dim = 0.12;
      const darkBgHex = `#${Math.floor(prime.r * dim).toString(16).padStart(2, '0')}${Math.floor(prime.g * dim).toString(16).padStart(2, '0')}${Math.floor(prime.b * dim).toString(16).padStart(2, '0')}`;
      callback(primaryHex, secondaryHex, darkBgHex);
    } catch (e) { callback("#00f2fe", "#4facfe", "#020d1c"); }
  };
  img.onerror = function () { callback("#00f2fe", "#4facfe", "#020d1c"); };
}

function updateMediaSession(track) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artistName || "Unknown Artist",
    artwork: [{ src: track.image, sizes: '512x512', type: 'image/jpeg' }]
  });
  navigator.mediaSession.setActionHandler('play', () => { audioElement.play(); if (playPauseBtn) playPauseBtn.innerHTML = "||"; });
  navigator.mediaSession.setActionHandler('pause', () => { audioElement.pause(); if (playPauseBtn) playPauseBtn.innerHTML = "►"; });
  navigator.mediaSession.setActionHandler('previoustrack', () => skipTrack(-1));
  navigator.mediaSession.setActionHandler('nexttrack', () => skipTrack(1));
}

function setupUltraFastTaps() {
  document.querySelectorAll('.action-btn, .latch-btn, .theme-btn, .song-row, .modal-btn').forEach(btn => {
    btn.addEventListener('pointerdown', () => { btn.style.transform = "scale(0.96)"; });
    btn.addEventListener('pointerup', () => { btn.style.transform = ""; });
    btn.addEventListener('pointerleave', () => { btn.style.transform = ""; });
  });
}

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}