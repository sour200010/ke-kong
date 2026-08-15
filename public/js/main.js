// 1. Digital Clock
function updateClock() {
  const clockEl = document.getElementById('clock');
  if (!clockEl) return;
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: true 
  }).toLowerCase();
}
updateClock();
const clockTimer = setInterval(updateClock, 1000);

// 2. Real-Time Online Counter
if (typeof io !== 'undefined') {
  const socket = io();
  socket.on('userCountUpdate', (count) => {
    const userCountEl = document.getElementById('user-count');
    if (userCountEl) userCountEl.textContent = count;
  });
}

// 3. UI Elements & Vector Shapes
const playBtn = document.getElementById('play-btn');
const playIcon = document.getElementById('play-icon');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const progressBar = document.getElementById('progress-bar');
const currentTimeEl = document.getElementById('current-time');
const durationTimeEl = document.getElementById('duration-time');
const albumCover = document.getElementById('album-cover');
const trackTitleEl = document.getElementById('track-title');
const trackArtistEl = document.getElementById('track-artist');

const PLAY_PATH = 'M8 5v14l11-7z';
const PAUSE_PATH = 'M6 5h3.5v14H6V5zm8.5 0H18v14h-3.5V5z';

function setPlayIcon(playing) {
  if (!playIcon) return;
  const path = playIcon.querySelector('path');
  if (path) path.setAttribute('d', playing ? PAUSE_PATH : PLAY_PATH);
}

albumCover.onload = () => { albumCover.classList.remove('art-error'); };
albumCover.onerror = () => { albumCover.classList.add('art-error'); };

let ytPlayer = null;
let isPlayerReady = false;
let isPlaying = false;
let currentVideoId = '';
let pendingAction = null;
let errorStreak = 0;

// Clean title: removes promo metadata and extra brackets
function cleanSongTitle(rawTitle) {
  if (!rawTitle) return "";

  return rawTitle
    .replace(/\s*[\(\[\{][^\)\]\}]*(official|lyric|video|audio|original|visualizer|mv|remastered|hd|4k|full|prod|feat|ft)[^\)\]\}]*[\)\]\}]/gi, '')
    .replace(/[\(\[\{\)\]\}]/g, '')
    .replace(/\s*[\-\|\–\—:]\s*(official\s*(music\s*)?video|original\s+song|lyric(al)?\s*video|audio|full\s*video|4k\s*uhd|hd\s*video).*$/gi, '')
    .trim();
}

function cleanArtistName(author) {
  if (!author || /sour/i.test(author)) {
    return "SK Film's";
  }
  return author.trim();
}

// 4. YouTube Player Engine
function initYouTubePlayer() {
  ytPlayer = new YT.Player('youtube-player', {
    height: '200',
    width: '200',
    playerVars: {
      autoplay: 0,
      controls: 0,
      loop: 1,
      enablejsapi: 1,
      origin: window.location.origin
    },
    events: {
      'onReady': onPlayerReady,
      'onStateChange': onPlayerStateChange,
      'onError': onPlayerError
    }
  });
}

window.onYouTubeIframeAPIReady = initYouTubePlayer;
if (window.YT && window.YT.Player) initYouTubePlayer();

function formatTime(seconds) {
  if (isNaN(seconds) || seconds <= 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function updateTrackDetails() {
  if (!ytPlayer || !ytPlayer.getVideoData) return false;
  const videoData = ytPlayer.getVideoData();

  if (videoData && videoData.title && videoData.title !== "") {
    const title = cleanSongTitle(videoData.title);
    const author = cleanArtistName(videoData.author);

    if (title) trackTitleEl.textContent = title;
    trackArtistEl.textContent = author;

    if (videoData.video_id && videoData.video_id !== currentVideoId) {
      currentVideoId = videoData.video_id;
      albumCover.classList.remove('art-error');
      albumCover.src = `https://img.youtube.com/vi/${currentVideoId}/hqdefault.jpg`;
      albumCover.alt = title ? `Album art for ${title}` : 'Album art';
    }

    const duration = ytPlayer.getDuration ? ytPlayer.getDuration() : 0;
    if (duration > 0) {
      progressBar.max = duration;
      durationTimeEl.textContent = formatTime(duration);
    }
    return true;
  }
  return false;
}

function onPlayerReady(event) {
  isPlayerReady = true;
  event.target.setLoop(true);
  
  if (event.target.unMute) {
    event.target.unMute();
    event.target.setVolume(100);
  }

  // Starts with track 0 (the live top track)
  event.target.cuePlaylist({
    listType: 'playlist',
    list: 'PLUOGg99dpdEU',
    index: 0
  });

  let attempts = 0;
  const poller = setInterval(() => {
    attempts++;
    if (updateTrackDetails() || attempts > 30) {
      clearInterval(poller);
    }
  }, 100);

  if (pendingAction) {
    pendingAction();
    pendingAction = null;
  }
}

function onPlayerStateChange(event) {
  updateTrackDetails();

  if (event.data === YT.PlayerState.PLAYING) {
    isPlaying = true;
    errorStreak = 0;
    setPlayIcon(true);
    albumCover.style.animationPlayState = 'running';
  } else if (event.data === YT.PlayerState.ENDED) {
    goToNextTrack();
  } else {
    isPlaying = false;
    setPlayIcon(false);
    albumCover.style.animationPlayState = 'paused';
  }
}

function onPlayerError(event) {
  console.warn("Track error:", event.data);
  errorStreak++;
  if (errorStreak < 5 && ytPlayer && ytPlayer.nextVideo) {
    setTimeout(() => ytPlayer.nextVideo(), 500);
  } else {
    console.error("Too many consecutive track errors — stopping auto-skip.");
    errorStreak = 0;
  }
}

const progressTimer = setInterval(() => {
  if (isPlayerReady && ytPlayer && ytPlayer.getCurrentTime && isPlaying) {
    const current = ytPlayer.getCurrentTime();
    const duration = ytPlayer.getDuration();
    if (duration > 0) {
      progressBar.max = duration;
      progressBar.value = current;
      currentTimeEl.textContent = formatTime(current);
      durationTimeEl.textContent = formatTime(duration);
    }
  }
}, 400);

function handlePlayToggle() {
  if (!isPlayerReady || !ytPlayer) {
    pendingAction = handlePlayToggle;
    return;
  }
  ytPlayer.unMute();
  ytPlayer.setVolume(100);
  if (isPlaying) {
    ytPlayer.pauseVideo();
  } else {
    ytPlayer.playVideo();
  }
}

function goToNextTrack() {
  if (!ytPlayer) return;
  const playlist = ytPlayer.getPlaylist ? ytPlayer.getPlaylist() : null;
  const currentIndex = ytPlayer.getPlaylistIndex ? ytPlayer.getPlaylistIndex() : -1;

  if (playlist && playlist.length > 0 && currentIndex >= playlist.length - 1) {
    ytPlayer.playVideoAt(0);
  } else if (ytPlayer.nextVideo) {
    ytPlayer.nextVideo();
  }
}

function goToPrevTrack() {
  if (!ytPlayer) return;
  const playlist = ytPlayer.getPlaylist ? ytPlayer.getPlaylist() : null;
  const currentIndex = ytPlayer.getPlaylistIndex ? ytPlayer.getPlaylistIndex() : -1;

  if (playlist && playlist.length > 0 && currentIndex <= 0) {
    ytPlayer.playVideoAt(playlist.length - 1);
  } else if (ytPlayer.previousVideo) {
    ytPlayer.previousVideo();
  }
}

function handleNext() {
  if (!isPlayerReady || !ytPlayer) {
    pendingAction = handleNext;
    return;
  }
  ytPlayer.unMute();
  ytPlayer.setVolume(100);
  goToNextTrack();
}

function handlePrev() {
  if (!isPlayerReady || !ytPlayer) {
    pendingAction = handlePrev;
    return;
  }
  ytPlayer.unMute();
  ytPlayer.setVolume(100);
  goToPrevTrack();
}

playBtn.addEventListener('click', handlePlayToggle);
nextBtn.addEventListener('click', handleNext);
prevBtn.addEventListener('click', handlePrev);

progressBar.addEventListener('input', () => {
  if (isPlayerReady && ytPlayer && ytPlayer.seekTo) {
    ytPlayer.seekTo(progressBar.value, true);
  }
});

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
  switch (e.code) {
    case 'Space':
      e.preventDefault();
      handlePlayToggle();
      break;
    case 'ArrowRight':
    case 'KeyN':
      e.preventDefault();
      handleNext();
      break;
    case 'ArrowLeft':
    case 'KeyP':
      e.preventDefault();
      handlePrev();
      break;
    case 'KeyM':
      e.preventDefault();
      if (isPlayerReady && ytPlayer) {
        if (ytPlayer.isMuted()) ytPlayer.unMute();
        else ytPlayer.mute();
      }
      break;
  }
});