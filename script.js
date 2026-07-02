let musicData = [];
let flatPlaylist = [];

let currentArtistIndex = 0;
let currentlyPlayingTrack = null;
let isShuffle = false;
let isRepeat = false;
let isDragging = false;

// Queue: ordered list of track objects to play next
let queue = [];

let favoritedUrls = JSON.parse(localStorage.getItem('musik_favorites')) || [];
let customPlaylists = JSON.parse(localStorage.getItem('musik_custom_playlists')) || {};
let shuffleHistory = [];
let pendingTrackUrl = null;
let playlistPendingDeletion = null;

// DOM refs
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
const createPlaylistBtn = document.getElementById('create-playlist-btn');
const playlistModal = document.getElementById('playlist-modal');
const newPlaylistInput = document.getElementById('new-playlist-input');
const savePlaylistBtn = document.getElementById('save-playlist-btn');
const cancelPlaylistBtn = document.getElementById('cancel-playlist-btn');
const addToPlaylistModal = document.getElementById('add-to-playlist-modal');
const playlistSelectDropdown = document.getElementById('playlist-select-dropdown');
const confirmAddTrackBtn = document.getElementById('confirm-add-track-btn');
const cancelAddTrackBtn = document.getElementById('cancel-add-track-btn');
const queueBtn = document.getElementById('queue-btn');
const queueModal = document.getElementById('queue-modal');
const queueList = document.getElementById('queue-list');
const clearQueueBtn = document.getElementById('clear-queue-btn');
const closeQueueBtn = document.getElementById('close-queue-btn');

// ─── TIMELINE SLIDER ──────────────────────────────────────────────────────────

timelineSlider.addEventListener('mousedown', () => { isDragging = true; });
timelineSlider.addEventListener('touchstart', () => { isDragging = true; }, { passive: true });

timelineSlider.addEventListener('input', () => {
  if (!audioElement.duration || isNaN(audioElement.duration)) return;
  const previewTime = (timelineSlider.value / 100) * audioElement.duration;
  if (timeDisplay) timeDisplay.textContent = `${formatTime(previewTime)} / ${formatTime(audioElement.duration)}`;
});

function commitSeek() {
  isDragging = false;
  if (!audioElement.duration || isNaN(audioElement.duration)) return;
  audioElement.currentTime = (timelineSlider.value / 100) * audioElement.duration;
  updatePositionState();
}
timelineSlider.addEventListener('mouseup', commitSeek);
timelineSlider.addEventListener('touchend', commitSeek);

audioElement.addEventListener('timeupdate', () => {
  if (isDragging || !audioElement.duration || isNaN(audioElement.duration)) return;
  timelineSlider.value = (audioElement.currentTime / audioElement.duration) * 100;
  if (timeDisplay) timeDisplay.textContent = `${formatTime(audioElement.currentTime)} / ${formatTime(audioElement.duration)}`;
  updatePositionState();
});

audioElement.addEventListener('loadedmetadata', () => {
  if (timeDisplay && !isNaN(audioElement.duration)) {
    timeDisplay.textContent = `00:00 / ${formatTime(audioElement.duration)}`;
  }
  if (!isDragging) timelineSlider.value = 0;
  updatePositionState();
});

audioElement.addEventListener('ended', () => {
  if (isRepeat) { audioElement.currentTime = 0; audioElement.play(); }
  else { skipTrack(1); }
});

// ─── POSITION STATE (lock screen seek bar) ────────────────────────────────────

function updatePositionState() {
  if (!('mediaSession' in navigator)) return;
  if (!audioElement.duration || isNaN(audioElement.duration)) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: audioElement.duration,
      playbackRate: audioElement.playbackRate,
      position: audioElement.currentTime,
    });
  } catch (e) { /* ignore if not supported */ }
}

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

// ─── QUEUE ────────────────────────────────────────────────────────────────────

if (queueBtn) queueBtn.addEventListener('click', () => { renderQueueList(); queueModal.classList.add('active'); });
if (closeQueueBtn) closeQueueBtn.addEventListener('click', () => queueModal.classList.remove('active'));
if (clearQueueBtn) clearQueueBtn.addEventListener('click', () => { queue = []; renderQueueList(); });

function addToQueue(trackObj) {
  queue.push(trackObj);
}

function renderQueueList() {
  if (!queueList) return;
  queueList.innerHTML = '';

  if (queue.length === 0 && !currentlyPlayingTrack) {
    queueList.innerHTML = '<div class="queue-empty-msg">Queue is empty</div>';
    return;
  }

  // Show now playing at top (not draggable, not removable)
  if (currentlyPlayingTrack) {
    const nowRow = document.createElement('div');
    nowRow.className = 'queue-row queue-now-playing';
    nowRow.innerHTML = `
      <span class="queue-drag-handle" style="opacity:0">⠿</span>
      <div class="queue-track-info">
        <div class="queue-track-title">▶ ${currentlyPlayingTrack.title}</div>
        <div class="queue-track-artist">${currentlyPlayingTrack.artistName}</div>
      </div>
    `;
    queueList.appendChild(nowRow);
  }

  if (queue.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'queue-empty-msg';
    emptyMsg.textContent = 'Nothing queued — click ＋ on any song';
    queueList.appendChild(emptyMsg);
    return;
  }

  queue.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'queue-row';
    row.draggable = true;
    row.dataset.index = index;
    row.innerHTML = `
      <span class="queue-drag-handle">⠿</span>
      <div class="queue-track-info">
        <div class="queue-track-title">${item.title}</div>
        <div class="queue-track-artist">${item.artistName}</div>
      </div>
      <button class="queue-remove-btn" data-index="${index}">✕</button>
    `;

    // Remove button
    row.querySelector('.queue-remove-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      queue.splice(index, 1);
      renderQueueList();
    });

    // Click row to jump to that track
    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('queue-remove-btn')) return;
      const jumped = queue.splice(index, 1)[0];
      playSong(jumped);
      renderQueueList();
    });

    // Drag-to-reorder
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', index);
      row.classList.add('queue-dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('queue-dragging'));
    row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('queue-drag-over'); });
    row.addEventListener('dragleave', () => row.classList.remove('queue-drag-over'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('queue-drag-over');
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
      const toIndex = index;
      if (fromIndex === toIndex) return;
      const [moved] = queue.splice(fromIndex, 1);
      queue.splice(toIndex, 0, moved);
      renderQueueList();
    });

    queueList.appendChild(row);
  });

  // Touch drag-to-reorder (mobile)
  setupQueueTouchReorder();
}

function setupQueueTouchReorder() {
  const rows = queueList.querySelectorAll('.queue-row[draggable]');
  let dragSrc = null;
  let dragSrcIndex = -1;

  rows.forEach((row) => {
    const handle = row.querySelector('.queue-drag-handle');
    if (!handle) return;

    handle.addEventListener('touchstart', (e) => {
      dragSrc = row;
      dragSrcIndex = parseInt(row.dataset.index);
      row.classList.add('queue-dragging');
    }, { passive: true });

    handle.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const targetRow = el ? el.closest('.queue-row[draggable]') : null;
      rows.forEach(r => r.classList.remove('queue-drag-over'));
      if (targetRow && targetRow !== dragSrc) targetRow.classList.add('queue-drag-over');
    }, { passive: false });

    handle.addEventListener('touchend', (e) => {
      row.classList.remove('queue-dragging');
      rows.forEach(r => r.classList.remove('queue-drag-over'));
      const touch = e.changedTouches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const targetRow = el ? el.closest('.queue-row[draggable]') : null;
      if (targetRow && targetRow !== dragSrc) {
        const toIndex = parseInt(targetRow.dataset.index);
        if (!isNaN(toIndex) && toIndex !== dragSrcIndex) {
          const [moved] = queue.splice(dragSrcIndex, 1);
          queue.splice(toIndex, 0, moved);
          renderQueueList();
        }
      }
      dragSrc = null;
      dragSrcIndex = -1;
    });
  });
}

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

  // Always dynamic art
  applyDynamicArt();

  refreshPlaylistsInMenu();
  buildCarouselDOM();
  updateCarousel();
  setupMobileSwipes();
  setupUltraFastTaps();

  if (createPlaylistBtn) createPlaylistBtn.addEventListener('click', openPlaylistCreationModal);
}

// ─── THEME: ALWAYS DYNAMIC ART ────────────────────────────────────────────────

function applyDynamicArt(imgUrl) {
  if (imgUrl) {
    extractDominantColorsFromImg(imgUrl, (primary, secondary, darkBg) => {
      document.documentElement.style.setProperty('--aero-aqua-gradient', `linear-gradient(135deg, ${primary}e6 0%, ${secondary}fa 100%)`);
      document.documentElement.style.setProperty('--aqua-glow', primary);
      document.documentElement.style.setProperty('--mode-active-text', secondary);
      document.documentElement.style.setProperty('--deep-blue-bg', darkBg);
      document.documentElement.style.setProperty('--bg-radial-1', primary);
      document.documentElement.style.setProperty('--bg-radial-2', secondary);
      forceBodyRepaint();
    });
  } else {
    document.documentElement.style.setProperty('--aero-aqua-gradient', `linear-gradient(135deg, #1766db 0%, #00f2fe 100%)`);
    document.documentElement.style.setProperty('--aqua-glow', '#00f0ff');
    document.documentElement.style.setProperty('--mode-active-text', '#3bf3ff');
    document.documentElement.style.setProperty('--deep-blue-bg', '#031024');
    document.documentElement.style.setProperty('--bg-radial-1', '#00bfff');
    document.documentElement.style.setProperty('--bg-radial-2', 'rgba(0,240,255,0.15)');
    forceBodyRepaint();
  }
}

function forceBodyRepaint() {
  // Re-apply background-image inline so browser picks up new variable values
  const b = document.body;
  b.style.backgroundImage = 'none';
  requestAnimationFrame(() => {
    b.style.backgroundImage = '';
  });
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
    musicData.unshift({ artist: playlistName, songs: tracks.map(t => ({ title: t.title, audioUrl: t.audioUrl, originalArtist: t.artistName, image: t.image })) });
  });
  const favoriteTracks = flatPlaylist.filter(t => favoritedUrls.includes(t.audioUrl));
  if (favoriteTracks.length > 0) {
    musicData.unshift({ artist: "My Favorites", songs: favoriteTracks.map(t => ({ title: t.title, audioUrl: t.audioUrl, originalArtist: t.artistName, image: t.image })) });
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
    refreshPlaylistsInMenu(); buildCarouselDOM();
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
    const isFav = favoritedUrls.includes(song.audioUrl);
    let displayTitle = song.title;
    if ((activeArtist.artist === "Other" || activeArtist.artist === "My Favorites" || isCustomPlaylist) && song.originalArtist) {
      displayTitle += ` <small style="color:var(--text-muted); font-size:0.75rem; font-weight:normal; margin-left:4px;">by ${song.originalArtist}</small>`;
    }

    // Outer clip container (hides the swipe reveal)
    const swipeWrap = document.createElement('div');
    swipeWrap.classList.add('swipe-wrap');

    // The green queue-reveal shown behind the row when swiping right
    const revealBg = document.createElement('div');
    revealBg.classList.add('swipe-reveal');
    revealBg.innerHTML = `<span class="swipe-reveal-icon">▤</span><span class="swipe-reveal-label">Queue</span>`;

    // The actual row (sits on top, slides right)
    const row = document.createElement('div');
    row.classList.add('song-row');
    if (currentlyPlayingTrack && currentlyPlayingTrack.audioUrl === song.audioUrl) row.classList.add('playing');
    row.innerHTML = `
      <span class="song-title">${displayTitle}</span>
      <div class="song-actions-wrapper">
        <button class="playlist-add-btn" data-url="${song.audioUrl}" title="Add to playlist">＋</button>
        <button class="fav-star-btn ${isFav ? 'is-fav' : ''}" data-url="${song.audioUrl}">★</button>
      </div>
    `;

    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('fav-star-btn')) { toggleFavorite(song.audioUrl); return; }
      if (e.target.classList.contains('playlist-add-btn')) { openAddToPlaylistModal(song.audioUrl); return; }
      const parsedTrack = flatPlaylist.find(t => t.audioUrl === song.audioUrl);
      if (parsedTrack) playSong(parsedTrack);
    });

    // ── Swipe-to-queue touch logic ──
    let touchStartX = 0;
    let touchStartY = 0;
    let currentX = 0;
    let swiping = false;
    let lockAxis = null; // 'h' or 'v' — decided on first move

    const QUEUE_THRESHOLD = 80; // px to trigger queue action
    const MAX_SWIPE = 110;

    row.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      currentX = 0;
      lockAxis = null;
      swiping = false;
      row.style.transition = 'none';
    }, { passive: true });

    row.addEventListener('touchmove', (e) => {
      const dx = e.touches[0].clientX - touchStartX;
      const dy = e.touches[0].clientY - touchStartY;

      // Determine axis lock on first move
      if (!lockAxis) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        lockAxis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      }

      if (lockAxis === 'v') return; // let the list scroll normally

      // Only right swipe (positive dx)
      if (dx < 0) return;
      e.preventDefault(); // prevent scroll when swiping horizontally
      swiping = true;
      currentX = Math.min(dx, MAX_SWIPE);

      // Rubber-band resistance past threshold
      if (currentX > QUEUE_THRESHOLD) {
        const overshoot = currentX - QUEUE_THRESHOLD;
        currentX = QUEUE_THRESHOLD + overshoot * 0.25;
      }

      row.style.transform = `translateX(${currentX}px)`;

      // Reveal opacity scales with swipe distance
      const progress = Math.min(currentX / QUEUE_THRESHOLD, 1);
      revealBg.style.opacity = progress;
      revealBg.classList.toggle('swipe-reveal-ready', currentX >= QUEUE_THRESHOLD);
    }, { passive: false });

    row.addEventListener('touchend', () => {
      if (!swiping) return;
      swiping = false;
      row.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';

      if (currentX >= QUEUE_THRESHOLD) {
        // Confirmed — flash green, snap back
        row.style.transform = `translateX(${QUEUE_THRESHOLD + 10}px)`;
        revealBg.classList.add('swipe-reveal-confirm');
        setTimeout(() => {
          row.style.transform = 'translateX(0)';
          revealBg.style.opacity = 0;
          revealBg.classList.remove('swipe-reveal-ready', 'swipe-reveal-confirm');
        }, 220);

        const t = flatPlaylist.find(t => t.audioUrl === song.audioUrl);
        if (t) {
          addToQueue(t);
          queueBtn.classList.add('queue-has-items');
          showQueueToast(t.title);
        }
      } else {
        // Not enough — snap back
        row.style.transform = 'translateX(0)';
        revealBg.style.opacity = 0;
        revealBg.classList.remove('swipe-reveal-ready');
      }
      currentX = 0;
    });

    swipeWrap.appendChild(revealBg);
    swipeWrap.appendChild(row);
    songsListContainer.appendChild(swipeWrap);
  });
}

// ─── PLAYBACK ─────────────────────────────────────────────────────────────────

function playSong(song) {
  if (!audioElement) return;
  currentlyPlayingTrack = song;

  isDragging = false;
  timelineSlider.value = 0;
  if (timeDisplay) timeDisplay.textContent = `00:00 / 00:00`;

  audioElement.src = song.audioUrl;
  audioElement.load();

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
      applyDynamicArt(song.image);
    } else {
      artworkPlaceholder.style.backgroundImage = 'none';
      artworkPlaceholder.innerHTML = "🎵";
      applyDynamicArt(null);
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
  // If queue has items and moving forward, consume from queue
  if (direction === 1 && queue.length > 0) {
    const next = queue.shift();
    playSong(next);
    return;
  }

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

// ─── MEDIA SESSION (lock screen controls + seek bar) ─────────────────────────

function updateMediaSession(song) {
  if (!('mediaSession' in navigator)) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.title,
    artist: song.artistName || "Unknown Artist",
    artwork: song.image ? [{ src: song.image, sizes: '512x512', type: 'image/jpeg' }] : []
  });

  navigator.mediaSession.setActionHandler('play', () => {
    audioElement.play();
    if (playPauseBtn) playPauseBtn.innerHTML = "||";
    navigator.mediaSession.playbackState = 'playing';
  });
  navigator.mediaSession.setActionHandler('pause', () => {
    audioElement.pause();
    if (playPauseBtn) playPauseBtn.innerHTML = "►";
    navigator.mediaSession.playbackState = 'paused';
  });
  navigator.mediaSession.setActionHandler('previoustrack', () => skipTrack(-1));
  navigator.mediaSession.setActionHandler('nexttrack', () => skipTrack(1));

  // seekto: what makes the lock screen seek bar actually work
  navigator.mediaSession.setActionHandler('seekto', (details) => {
    if (details.seekTime !== undefined) {
      audioElement.currentTime = details.seekTime;
      updatePositionState();
    }
  });

  // seekbackward / seekforward (15s jumps, shown on some lock screens)
  navigator.mediaSession.setActionHandler('seekbackward', (details) => {
    audioElement.currentTime = Math.max(0, audioElement.currentTime - (details.seekOffset || 15));
    updatePositionState();
  });
  navigator.mediaSession.setActionHandler('seekforward', (details) => {
    audioElement.currentTime = Math.min(audioElement.duration, audioElement.currentTime + (details.seekOffset || 15));
    updatePositionState();
  });

  navigator.mediaSession.playbackState = 'playing';
  updatePositionState();
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function setupUltraFastTaps() {
  document.querySelectorAll('.action-btn, .latch-btn, .song-row, .modal-btn').forEach(btn => {
    btn.addEventListener('pointerdown', () => { btn.style.transform = "scale(0.96)"; });
    btn.addEventListener('pointerup', () => { btn.style.transform = ""; });
    btn.addEventListener('pointerleave', () => { btn.style.transform = ""; });
  });
}

function showQueueToast(title) {
  // Remove any existing toast
  const existing = document.querySelector('.queue-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'queue-toast';
  toast.textContent = `+ Queued: ${title}`;
  document.querySelector('.player-chassis').appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('queue-toast-show'));
  });

  setTimeout(() => {
    toast.classList.remove('queue-toast-show');
    setTimeout(() => toast.remove(), 300);
  }, 1800);
}

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}