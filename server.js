// Requires Node 18+ for global fetch()
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Dynamic port for cloud hosting environments
const PORT = process.env.PORT || 3000;
const PLAYLIST_ID = 'PLUOGg99dpdEU';

let topTrackCache = {
  id: 'yFtlkOyWyHs',
  title: 'PAYAL',
  artist: "SK Film's"
};

// Clean title on server
function cleanTitle(raw) {
  if (!raw) return "";

  return raw
    .replace(/\s*[\(\[\{][^\)\]\}]*(official|lyric|video|audio|original|visualizer|mv|remastered|hd|4k)[^\)\]\}]*[\)\]\}]/gi, '')
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

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Background sync for #1 track
async function syncTopSong() {
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=${PLAYLIST_ID}`);
    if (!res.ok) throw new Error(`Feed request failed: ${res.status}`);
    const xml = await res.text();

    const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
    if (!entryMatch) return;
    const entry = entryMatch[1];

    const idMatch = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
    const titleMatch = entry.match(/<title>(.*?)<\/title>/);
    const authorMatch = entry.match(/<name>(.*?)<\/name>/);

    if (idMatch && titleMatch) {
      const rawAuthor = authorMatch ? authorMatch[1] : "SK Film's";
      topTrackCache = {
        id: idMatch[1],
        title: cleanTitle(titleMatch[1]),
        artist: cleanArtistName(rawAuthor)
      };
    }
  } catch (err) {
    console.error("Top song sync error:", err.message);
  }
}

syncTopSong();
setInterval(syncTopSong, 60 * 1000);

app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, 'public', 'index.html');
  fs.readFile(htmlPath, 'utf8', (err, html) => {
    if (err) return res.status(500).send("Error loading page");

    const deliveredHtml = html
      .replace(/__TRACK_ID__/g, escapeHtml(topTrackCache.id))
      .replace(/__TRACK_TITLE__/g, escapeHtml(topTrackCache.title))
      .replace(/__TRACK_ARTIST__/g, escapeHtml(topTrackCache.artist));

    res.send(deliveredHtml);
  });
});

app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.get('/index.html', (req, res) => res.redirect('/'));

// Real-time user counter
let userCount = 0;
io.on('connection', (socket) => {
  userCount++;
  io.emit('userCountUpdate', userCount);

  socket.on('disconnect', () => {
    userCount = Math.max(0, userCount - 1);
    io.emit('userCountUpdate', userCount);
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));