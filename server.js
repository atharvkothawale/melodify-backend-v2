const express = require('express');
const ytdl = require('@distube/ytdl-core');
const ytSearch = require('yt-search');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));

// ─── Search ───────────────────────────────────────────────────────────────────

app.get('/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Missing query' });

  try {
    const searchResults = await ytSearch(query);
    const results = searchResults.videos.slice(0, 20).map((v) => ({
      videoId: v.videoId,
      title: v.title,
      thumbnail: v.thumbnail,
      duration: v.timestamp,
      author: v.author.name,
    }));
    return res.json({ query, results });
  } catch (err) {
    return res.status(500).json({ error: 'Search failed', details: err.message });
  }
});

// ─── Stream ───────────────────────────────────────────────────────────────────

app.get('/stream', (req, res) => {
  const { videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: 'Missing videoId' });
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return res.status(400).json({ error: 'Invalid videoId' });

  const url = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const subprocess = youtubedl.exec(url, {
      output: '-',
      format: 'bestaudio'
    }, { stdio: ['ignore', 'pipe', 'ignore'] });

    res.setHeader('Content-Type', 'audio/webm');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    subprocess.stdout.pipe(res);

    req.on('close', () => {
      try {
        subprocess.kill();
      } catch (e) {}
    });
  } catch (err) {
    console.error('Stream error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});