// server.js
// A simple Express server for searching and streaming YouTube audio

const express = require('express');
const ytDlpExec = require('yt-dlp-exec');
const ytSearch = require('yt-search');
const cors = require('cors');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ───────────────────────────────────────────────────────────────

// Allow requests from any origin (useful when your frontend runs on a different port)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Range'],
  exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges'],
}));


// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /search?q=your+search+term
 *
 * Accepts a search query via the `q` query parameter.
 * Searches YouTube using yt-search and returns the top 10 video results.
 * Each result includes: videoId, title, thumbnail, duration, and author.
 */
app.get('/search', async (req, res) => {
  const query = req.query.q;

  if (!query) {
    return res.status(400).json({ error: 'Please provide a search query using ?q=your+query' });
  }

  try {
    const searchResults = await ytSearch(query);

    const results = searchResults.videos.slice(0, 10).map((video) => ({
      videoId: video.videoId,
      title: video.title,
      thumbnail: video.thumbnail,
      duration: video.timestamp,  // e.g. "3:45"
      author: video.author.name,
    }));

    return res.json({ query, results });
  } catch (err) {
    console.error('Search error:', err.message);
    return res.status(500).json({ error: 'Failed to search YouTube.', details: err.message });
  }
});

/**
 * GET /stream?videoId=dQw4w9WgXcQ
 *
 * Accepts a YouTube video ID via the `videoId` query parameter.
 * Uses yt-dlp-exec to get the direct CDN audio URL, then proxies
 * that audio stream through Node's built-in https module to the client.
 */
app.get('/stream', async (req, res) => {
  const videoId = req.query.videoId;

  if (!videoId) {
    return res.status(400).json({ error: 'Please provide a videoId using ?videoId=VIDEO_ID' });
  }

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    // Step 1: Use yt-dlp-exec to get the direct audio CDN URL
    const output = await ytDlpExec(videoUrl, {
      format: 'bestaudio/best',
      getUrl: true,
    });

    const audioUrl = output.trim();

    if (!audioUrl) {
      return res.status(500).json({ error: 'Could not resolve audio URL.' });
    }

    console.log(`[stream] Resolved audio URL for videoId=${videoId}`);

    // Step 2: Set response headers before piping
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Step 3: Pipe the audio from the CDN through this server to the client
    const cdnReq = https.get(audioUrl, (cdnRes) => {
      if (cdnRes.statusCode !== 200 && cdnRes.statusCode !== 206) {
        console.error(`[stream] CDN returned status ${cdnRes.statusCode}`);
        if (!res.headersSent) res.status(502).json({ error: `CDN returned ${cdnRes.statusCode}` });
        cdnRes.resume(); // drain so socket is freed
        return;
      }

      // Pipe CDN audio bytes directly to the client response
      cdnRes.pipe(res);

      cdnRes.on('error', (err) => {
        console.error('[stream] CDN response error:', err.message);
        if (!res.headersSent) res.status(500).end();
      });
    });

    cdnReq.on('error', (err) => {
      console.error('[stream] CDN request error:', err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Failed to fetch audio from CDN.', details: err.message });
      }
    });

    // Clean up if the client disconnects early
    req.on('close', () => cdnReq.destroy());

  } catch (err) {
    console.error('[stream] yt-dlp error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve audio URL.', details: err.message });
  }
});

// ─── Start Server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
  console.log(`   - Search: http://localhost:${PORT}/search?q=lofi`);
  console.log(`   - Stream: http://localhost:${PORT}/stream?videoId=dQw4w9WgXcQ`);
});
