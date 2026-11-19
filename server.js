const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const yts = require('yt-search');

const app = express();
const PORT = process.env.PORT || 3000;

// Rutas habituales en FydeOS / ChromeOS Linux / Home
const candidateDirs = [
  process.env.VIDEOS_DIR,
  '/home/chronos/user/MyFiles/Videos',
  '/home/chronos/user/MyFiles/videos',
  path.join(os.homedir(), 'Videos'),
  path.join(os.homedir(), 'videos'),
  path.join(__dirname, 'videos')
].filter(Boolean);

let VIDEOS_DIR = candidateDirs.find(dir => fs.existsSync(dir));
if (!VIDEOS_DIR) {
  VIDEOS_DIR = path.join(__dirname, 'videos');
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
}

console.log(`📂 Carpeta de videos local activa: ${VIDEOS_DIR}`);

app.use(express.static(path.join(__dirname, 'public')));

// Extensiones multimedia permitidas
const ALLOWED_EXTS = new Set(['.mp4', '.webm', '.mkv', '.avi', '.mov', '.mp3']);

// 1. Endpoint: Listar biblioteca local de FydeOS
app.get('/api/local-videos', (req, res) => {
  try {
    const files = fs.readdirSync(VIDEOS_DIR, { withFileTypes: true });
    const videos = files
      .filter(dirent => dirent.isFile() && ALLOWED_EXTS.has(path.extname(dirent.name).toLowerCase()))
      .map((dirent, idx) => ({
        id: `local_${idx}`,
        code: String(idx + 1).padStart(3, '0'),
        title: path.parse(dirent.name).name.replace(/[_-]+/g, ' '),
        filename: dirent.name,
        source: 'local',
        url: `/stream/${encodeURIComponent(dirent.name)}`
      }));

    res.json({ directory: VIDEOS_DIR, videos });
  } catch (err) {
    console.error('Error leyendo carpeta local:', err);
    res.status(500).json({ error: 'No se pudo leer la carpeta de videos', videos: [] });
  }
});

// 2. Endpoint: Streaming con soporte Range (para adelantar/retroceder sin cortes)
app.get('/stream/:filename', (req, res) => {
  const safeName = path.basename(req.params.filename);
  const filePath = path.join(VIDEOS_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Archivo no encontrado');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const ext = path.extname(safeName).toLowerCase();
  const mimeTypes = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg'
  };
  const contentType = mimeTypes[ext] || 'video/mp4';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// 3. Endpoint: Buscador de YouTube en vivo
app.get('/api/youtube', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ videos: [] });

  try {
    const r = await yts(q);
    const videos = r.videos.slice(0, 18).map((v, idx) => ({
      id: v.videoId,
      code: `YT${String(idx + 1).padStart(2, '0')}`,
      title: v.title,
      author: v.author.name,
      duration: v.timestamp,
      thumbnail: v.thumbnail,
      source: 'youtube'
    }));
    res.json({ videos });
  } catch (err) {
    console.error('Error buscando en YouTube:', err);
    res.status(500).json({ error: 'Error al consultar YouTube', videos: [] });
  }
});

app.listen(PORT, () => {
  console.log(`🕹️  ARCADE JUKEBOX 90s corriendo en http://localhost:${PORT}`);
});
