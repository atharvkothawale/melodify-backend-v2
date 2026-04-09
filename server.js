const express = require('express');
const ytdl = require('@distube/ytdl-core');
const ytSearch = require('yt-search');
const cors = require('cors');
const https = require('https');

const rawCookies = process.env.YOUTUBE_COOKIES ? JSON.parse(process.env.YOUTUBE_COOKIES) : [];
const cookieString = rawCookies.map(c => `${c.name}=${c.value}`).join('; ');

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

  const apiUrl = `https://invidious.privacyredirect.com/api/v1/videos/${videoId}`;

  https.get(apiUrl, (apiRes) => {
    let data = '';

    apiRes.on('data', (chunk) => {
      data += chunk;
    });

    apiRes.on('end', () => {
      try {
        if (apiRes.statusCode !== 200) {
          return res.status(apiRes.statusCode).json({ error: 'Failed to fetch video data from Invidious' });
        }

        const json = JSON.parse(data);
        
        if (!json.adaptiveFormats || !Array.isArray(json.adaptiveFormats)) {
          return res.status(500).json({ error: 'No adaptive formats found' });
        }

        const audioFormat = json.adaptiveFormats.find(f => f.type && f.type.startsWith('audio/'));

        if (!audioFormat || !audioFormat.url) {
          return res.status(500).json({ error: 'No audio format found' });
        }

        res.redirect(audioFormat.url);
      } catch (err) {
        console.error('Error parsing Invidious response:', err.message);
        res.status(500).json({ error: 'Failed to parse video data' });
      }
    });

  }).on('error', (err) => {
    console.error('Invidious API request error:', err.message);
    res.status(500).json({ error: 'Failed to request video data' });
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
