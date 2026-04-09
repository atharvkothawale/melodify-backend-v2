const express = require('express');
const ytdl = require('@distube/ytdl-core');
const ytSearch = require('yt-search');
const cors = require('cors');

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

app.get('/stream', async (req, res) => {
  const { videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: 'Missing videoId' });
  if (!ytdl.validateID(videoId)) return res.status(400).json({ error: 'Invalid videoId' });

  const url = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    // Get info first to find best audio format
    const requestOptions = cookieString ? { headers: { cookie: cookieString } } : {};
    const info = await ytdl.getInfo(url, requestOptions);
    const format = ytdl.chooseFormat(info.formats, {
      quality: 'highestaudio',
      filter: 'audioonly',
    });

    if (!format) return res.status(500).json({ error: 'No audio format found' });

    res.setHeader('Content-Type', format.mimeType || 'audio/webm');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    const stream = ytdl.downloadFromInfo(info, { format, requestOptions });

    stream.on('error', (err) => {
      console.error('Stream error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: err.message });
      else res.end();
    });

    req.on('close', () => stream.destroy());

    stream.pipe(res);
  } catch (err) {
    console.error('Stream error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
