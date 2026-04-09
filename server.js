// server.js
// A simple Express server for searching and streaming YouTube audio

const express = require('express');
const ytdl = require('@distube/ytdl-core');
const ytSearch = require('yt-search');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ───────────────────────────────────────────────────────────────

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
 * Uses @distube/ytdl-core to pipe the highest quality audio directly
 * through this server to the client.
 */
app.get('/stream', async (req, res) => {
  const videoId = req.query.videoId;

  if (!videoId) {
    return res.status(400).json({ error: 'Please provide a videoId using ?videoId=VIDEO_ID' });
  }

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    // Validate the video ID before attempting to stream
    if (!ytdl.validateID(videoId)) {
      return res.status(400).json({ error: 'Invalid YouTube video ID.' });
    }

    console.log(`[stream] Starting audio stream for videoId=${videoId}`);

    // Set response headers
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Accept-Ranges', 'bytes');

    // Create the ytdl audio stream and pipe it to the response
    const audioStream = ytdl(videoUrl, {
      filter: 'audioonly',
      quality: 'highestaudio',
    });

    // Handle stream errors before piping
    audioStream.on('error', (err) => {
      console.error('[stream] ytdl error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream audio.', details: err.message });
      } else {
        res.end();
      }
    });

    // Clean up if client disconnects early
    req.on('close', () => {
      audioStream.destroy();
      console.log(`[stream] Client disconnected, stream destroyed for videoId=${videoId}`);
    });

    // Pipe audio stream directly to client
    audioStream.pipe(res);

  } catch (err) {
    console.error('[stream] Unexpected error:', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Unexpected error during streaming.', details: err.message });
    }
  }
});

// ─── Start Server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
  console.log(`   - Search: http://localhost:${PORT}/search?q=lofi`);
  console.log(`   - Stream: http://localhost:${PORT}/stream?videoId=dQw4w9WgXcQ`);
});
