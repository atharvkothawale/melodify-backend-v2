// server.js
// A simple Express server for searching and streaming YouTube audio

const express = require('express');
const ytDlpExec = require('yt-dlp-exec');
const ytSearch = require('yt-search');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;
// ─── Middleware ───────────────────────────────────────────────────────────────

// Allow requests from any origin (useful when your frontend runs on a different port)
app.use(cors());

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
* Uses yt-dlp to resolve the best direct audio URL, then redirects
* the client to that URL so the audio is served straight from YouTube's CDN.
*/
app.get('/stream', async (req, res) => {
  const videoId = req.query.videoId;

  if (!videoId) {
    return res.status(400).json({ error: 'Please provide a videoId using ?videoId=VIDEO_ID' });
  }

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    // Ask yt-dlp for the direct CDN URL of the best available audio format
    const output = await ytDlpExec(videoUrl, {
      format: 'bestaudio',
      getUrl: true,
    });

    // yt-dlp-exec resolves with the URL string (may contain a trailing newline)
    const audioUrl = output.trim();

    if (!audioUrl) {
      return res.status(500).json({ error: 'Could not resolve audio URL.' });
    }

    // Redirect the client directly to YouTube's CDN — no proxying needed
    return res.redirect(audioUrl);
  } catch (err) {
    console.error('yt-dlp error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve audio URL.', details: err.message });
  }
});

// ─── Start Server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
  console.log(`   - Search: http://localhost:${PORT}/search?q=lofi`);
  console.log(`   - Stream: http://localhost:${PORT}/stream?videoId=dQw4w9WgXcQ`);
});
