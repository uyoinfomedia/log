/**
 * Robust Local Development Server (Vanilla Node.js)
 * Automatically detects Hotspot IP, handles port conflicts, and supports file uploads.
 * Directory listing renders as a Windows-Explorer-style file browser
 * (Tiles / Details views, file-type icons, sortable columns).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

let PORT = 8050;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// ==========================================
// FILE TYPE HELPERS (icon + label per extension)
// ==========================================
const ICON_MAP = {
    '.jpg': '🖼️', '.jpeg': '🖼️', '.png': '🖼️', '.gif': '🖼️', '.svg': '🖼️',
    '.webp': '🖼️', '.bmp': '🖼️', '.ico': '🖼️',
    '.mp4': '🎬', '.mov': '🎬', '.avi': '🎬', '.mkv': '🎬', '.webm': '🎬', '.flv': '🎬',
    '.mp3': '🎵', '.wav': '🎵', '.ogg': '🎵', '.flac': '🎵', '.m4a': '🎵',
    '.pdf': '📕',
    '.doc': '📘', '.docx': '📘',
    '.xls': '📗', '.xlsx': '📗', '.csv': '📗',
    '.ppt': '📙', '.pptx': '📙',
    '.zip': '🗜️', '.rar': '🗜️', '.7z': '🗜️', '.tar': '🗜️', '.gz': '🗜️',
    '.js': '📜', '.mjs': '📜', '.ts': '📜', '.jsx': '📜', '.tsx': '📜', '.py': '📜',
    '.java': '📜', '.c': '📜', '.cpp': '📜', '.php': '📜', '.rb': '📜', '.go': '📜',
    '.rs': '📜', '.json': '📜', '.html': '📜', '.css': '📜',
    '.txt': '📝', '.md': '📝', '.log': '📝',
    '.exe': '⚙️', '.sh': '⚙️', '.bat': '⚙️',
    '.ttf': '🔤', '.otf': '🔤', '.woff': '🔤', '.woff2': '🔤'
};

const TYPE_LABEL_MAP = {
    '.jpg': 'JPEG Image', '.jpeg': 'JPEG Image', '.png': 'PNG Image', '.gif': 'GIF Image',
    '.svg': 'SVG Image', '.webp': 'WEBP Image', '.bmp': 'Bitmap Image', '.ico': 'Icon',
    '.mp4': 'MP4 Video', '.mov': 'QuickTime Video', '.avi': 'AVI Video', '.mkv': 'MKV Video',
    '.webm': 'WEBM Video', '.flv': 'FLV Video',
    '.mp3': 'MP3 Audio', '.wav': 'WAV Audio', '.ogg': 'OGG Audio', '.flac': 'FLAC Audio', '.m4a': 'M4A Audio',
    '.pdf': 'PDF Document',
    '.doc': 'Word Document', '.docx': 'Word Document',
    '.xls': 'Excel Spreadsheet', '.xlsx': 'Excel Spreadsheet', '.csv': 'CSV File',
    '.ppt': 'PowerPoint Presentation', '.pptx': 'PowerPoint Presentation',
    '.zip': 'ZIP Archive', '.rar': 'RAR Archive', '.7z': '7-Zip Archive', '.tar': 'TAR Archive', '.gz': 'GZip Archive',
    '.js': 'JavaScript File', '.mjs': 'JavaScript File', '.ts': 'TypeScript File', '.jsx': 'JSX File',
    '.tsx': 'TSX File', '.py': 'Python File', '.java': 'Java File', '.c': 'C File', '.cpp': 'C++ File',
    '.php': 'PHP File', '.rb': 'Ruby File', '.go': 'Go File', '.rs': 'Rust File', '.json': 'JSON File',
    '.html': 'HTML Document', '.css': 'CSS File',
    '.txt': 'Text Document', '.md': 'Markdown File', '.log': 'Log File',
    '.exe': 'Application', '.sh': 'Shell Script', '.bat': 'Batch File',
    '.ttf': 'Font File', '.otf': 'Font File', '.woff': 'Font File', '.woff2': 'Font File'
};

function getFileIcon(filename, isDir) {
    if (isDir) return '📁';
    const ext = path.extname(filename).toLowerCase();
    return ICON_MAP[ext] || '📄';
}

function getFileTypeLabel(filename, isDir) {
    if (isDir) return 'File folder';
    const ext = path.extname(filename).toLowerCase();
    return TYPE_LABEL_MAP[ext] || (ext ? ext.substring(1).toUpperCase() + ' File' : 'File');
}

function getHotspotAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return '127.0.0.1';
}

const server = http.createServer((req, res) => {
    // Parse URL safely
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const urlPath = decodeURIComponent(urlObj.pathname);

    // Normalize path to prevent leading slash issues in path.join
    const relativePath = urlPath.replace(/^\//, '');
    const filePath = relativePath ? path.join(ROOT_DIR, relativePath) : ROOT_DIR;

    // ==========================================
    // 1. HANDLE FILE UPLOADS (POST)
    // ==========================================
    if (req.method === 'POST' && urlObj.searchParams.has('upload')) {
        // Ensure the target is actually a directory
        try {
            const stats = fs.statSync(filePath);
            if (!stats.isDirectory()) {
                res.writeHead(403, { 'Content-Type': 'text/plain' });
                return res.end('Forbidden: Upload target must be a directory');
            }
        } catch (e) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('Not Found: Directory does not exist');
        }

        const filename = urlObj.searchParams.get('filename');
        if (!filename) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            return res.end('Bad Request: Missing filename');
        }

        // Strip any directory traversal attempts from the filename
        const safeFilename = path.basename(decodeURIComponent(filename));
        const uploadPath = path.join(filePath, safeFilename);

        // Security: Ensure the final path is strictly within ROOT_DIR
        const resolvedRoot = path.resolve(ROOT_DIR);
        const resolvedUpload = path.resolve(uploadPath);

        if (!resolvedUpload.startsWith(resolvedRoot + path.sep) && resolvedUpload !== resolvedRoot) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            return res.end('Forbidden: Invalid path');
        }

        // Stream the file directly to disk (memory efficient for large files)
        const writeStream = fs.createWriteStream(uploadPath);
        req.pipe(writeStream);

        writeStream.on('finish', () => {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Upload successful');
        });

        writeStream.on('error', (err) => {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Upload failed: ' + err.message);
        });
        return;
    }

    // Reject other HTTP methods (PUT, DELETE, etc.)
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        return res.end('Method Not Allowed');
    }

    // ==========================================
    // 2. HANDLE FILE/DIRECTORY SERVING (GET)
    // ==========================================
    fs.stat(filePath, (err, stats) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('404 - File Not Found');
        }

        if (stats.isDirectory()) {
            fs.readdir(filePath, (err, files) => {
                if (err) {
                    res.writeHead(500);
                    return res.end('Server Error');
                }

                const normalizedPath = urlPath.endsWith('/') ? urlPath : urlPath + '/';

                // Build entry metadata (name, isDir, size, mtime, icon, type label, link)
                const entries = files.map(file => {
                    const itemPath = path.join(filePath, file);
                    let stat = null;
                    try { stat = fs.statSync(itemPath); } catch (e) { /* ignore unreadable entries */ }
                    const isDir = stat ? stat.isDirectory() : false;
                    return {
                        name: file,
                        isDir,
                        size: stat ? stat.size : 0,
                        mtime: stat ? stat.mtime.toISOString() : new Date().toISOString(),
                        icon: getFileIcon(file, isDir),
                        type: getFileTypeLabel(file, isDir),
                        link: normalizedPath + file
                    };
                });

                // Default sort: folders first, then alphabetical
                entries.sort((a, b) => {
                    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
                    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
                });

                // Safely embed as JSON for the client-side script (guard against </script>)
                const entriesJson = JSON.stringify(entries).replace(/</g, '\\u003c');
                const parentLink = urlPath !== '/' ? '..' : null;

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(renderDirectoryPage(urlPath, entriesJson, parentLink));
            });
            return;
        }

        // Serve individual files
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(500);
                res.end('Server Error');
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            }
        });
    });
});

// ==========================================
// HTML TEMPLATE: Explorer-style directory page
// ==========================================
function renderDirectoryPage(urlPath, entriesJson, parentLink) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Index of ${urlPath}</title>
<style>
    :root {
        --accent: #0067c0;
        --accent-light: #e5f1fb;
        --border: #e1e1e1;
        --text: #1b1b1b;
        --text-dim: #6b6b6b;
    }
    * { box-sizing: border-box; }
    body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        margin: 0;
        background: #f6f6f6;
        color: var(--text);
    }
    .explorer {
        max-width: 1000px;
        margin: 0 auto;
        background: #fff;
        min-height: 100vh;
        box-shadow: 0 0 0 1px var(--border);
    }
    .titlebar {
        padding: 14px 20px;
        border-bottom: 1px solid var(--border);
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 10px;
    }
    .titlebar h1 {
        font-size: 1.05em;
        margin: 0;
        font-weight: 600;
        word-break: break-all;
    }
    .titlebar h1 .path-icon { margin-right: 6px; }
    .view-toggle {
        display: flex;
        border: 1px solid var(--border);
        border-radius: 6px;
        overflow: hidden;
        flex-shrink: 0;
    }
    .view-toggle button {
        border: none;
        background: #fff;
        padding: 7px 14px;
        font-size: 0.85em;
        cursor: pointer;
        color: var(--text-dim);
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .view-toggle button + button { border-left: 1px solid var(--border); }
    .view-toggle button.active {
        background: var(--accent-light);
        color: var(--accent);
        font-weight: 600;
    }
    .upload-panel {
        margin: 16px 20px;
        padding: 14px 16px;
        background: #f8f9fa;
        border-radius: 8px;
        border: 1.5px dashed #d3d3d3;
    }
    .upload-panel h3 {
        margin: 0 0 10px 0;
        font-size: 0.95em;
        color: #495057;
    }
    #uploadForm { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    #uploadForm input[type=file] {
        flex: 1; min-width: 180px; padding: 7px; border: 1px solid #ced4da; border-radius: 4px; background: #fff;
    }
    #uploadForm button {
        padding: 8px 18px; background: var(--accent); color: white; border: none;
        border-radius: 4px; cursor: pointer; font-weight: 600;
    }
    #uploadForm button:hover { background: #005299; }
    #uploadStatus { margin-top: 10px; font-weight: 600; font-size: 0.9em; }

    .parent-row {
        padding: 10px 20px;
        border-bottom: 1px solid var(--border);
    }
    .parent-row a {
        text-decoration: none; color: var(--accent); font-weight: 600; font-size: 0.9em;
    }

    /* ---- TILES VIEW ---- */
    #tilesView {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 4px;
        padding: 16px 20px;
    }
    .tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        text-decoration: none;
        color: var(--text);
        padding: 12px 6px;
        border-radius: 6px;
        cursor: pointer;
    }
    .tile:hover { background: var(--accent-light); }
    .tile .icon { font-size: 2.4em; line-height: 1; margin-bottom: 6px; }
    .tile .name {
        font-size: 0.8em;
        word-break: break-word;
        max-width: 100%;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    /* ---- DETAILS VIEW ---- */
    #detailsView { padding: 0 20px 20px; display: none; }
    table.details { width: 100%; border-collapse: collapse; font-size: 0.88em; }
    table.details thead th {
        text-align: left;
        padding: 8px 10px;
        border-bottom: 1px solid var(--border);
        color: var(--text-dim);
        font-weight: 600;
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
    }
    table.details thead th:hover { color: var(--accent); }
    table.details thead th .arrow { font-size: 0.75em; margin-left: 4px; opacity: 0.6; }
    table.details tbody tr { cursor: pointer; }
    table.details tbody tr:hover { background: var(--accent-light); }
    table.details tbody td {
        padding: 7px 10px;
        border-bottom: 1px solid #f2f2f2;
        white-space: nowrap;
    }
    table.details tbody td.name-cell {
        display: flex;
        align-items: center;
        gap: 8px;
        white-space: normal;
        word-break: break-all;
    }
    table.details tbody td a { text-decoration: none; color: var(--text); }
    table.details tbody td.col-size,
    table.details tbody td.col-modified { color: var(--text-dim); }
    .empty-msg { padding: 30px 20px; text-align: center; color: var(--text-dim); }
</style>
</head>
<body>
<div class="explorer">
    <div class="titlebar">
        <h1><span class="path-icon">📂</span>Index of ${urlPath}</h1>
        <div class="view-toggle">
            <button id="btnTiles" data-view="tiles">▦ Tiles</button>
            <button id="btnDetails" data-view="details">☰ Details</button>
        </div>
    </div>

    <div class="upload-panel">
        <h3>📤 Upload File to this Directory</h3>
        <form id="uploadForm">
            <input type="file" id="fileInput" required>
            <button type="submit">Upload</button>
        </form>
        <div id="uploadStatus"></div>
    </div>

    ${parentLink ? `<div class="parent-row"><a href="${parentLink}">⬆️ .. (Parent Directory)</a></div>` : ''}

    <div id="tilesView"></div>
    <div id="detailsView">
        <table class="details">
            <thead>
                <tr>
                    <th data-key="name">Name<span class="arrow"></span></th>
                    <th data-key="type">Type<span class="arrow"></span></th>
                    <th data-key="size">Size<span class="arrow"></span></th>
                    <th data-key="mtime">Date modified<span class="arrow"></span></th>
                </tr>
            </thead>
            <tbody id="detailsBody"></tbody>
        </table>
    </div>
    <div class="empty-msg" id="emptyMsg" style="display:none;">This folder is empty.</div>
</div>

<script>
const entries = ${entriesJson};

function formatBytes(bytes, isDir) {
    if (isDir) return '';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B','KB','MB','GB','TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
        ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
    return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

let sortKey = 'name';
let sortDir = 1; // 1 asc, -1 desc

function sortedEntries() {
    const copy = entries.slice();
    copy.sort((a, b) => {
        // folders always float to top regardless of column, matching Explorer behavior
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        let av = a[sortKey], bv = b[sortKey];
        if (sortKey === 'name' || sortKey === 'type') {
            av = av.toLowerCase(); bv = bv.toLowerCase();
            return av.localeCompare(bv) * sortDir;
        }
        if (sortKey === 'mtime') {
            return (new Date(av) - new Date(bv)) * sortDir;
        }
        // size
        return (av - bv) * sortDir;
    });
    return copy;
}

function renderTiles() {
    const container = document.getElementById('tilesView');
    const list = sortedEntries();
    container.innerHTML = list.map(e =>
        '<a class="tile" href="' + e.link + '" title="' + escapeHtml(e.name) + '">' +
            '<div class="icon">' + e.icon + '</div>' +
            '<div class="name">' + escapeHtml(e.name) + '</div>' +
        '</a>'
    ).join('');
}

function renderDetails() {
    const body = document.getElementById('detailsBody');
    const list = sortedEntries();
    body.innerHTML = list.map(e =>
        '<tr onclick="window.location.href=\\'' + e.link + '\\'">' +
            '<td class="name-cell"><span>' + e.icon + '</span><a href="' + e.link + '">' + escapeHtml(e.name) + '</a></td>' +
            '<td>' + escapeHtml(e.type) + '</td>' +
            '<td class="col-size">' + formatBytes(e.size, e.isDir) + '</td>' +
            '<td class="col-modified">' + formatDate(e.mtime) + '</td>' +
        '</tr>'
    ).join('');
    // update sort arrows
    document.querySelectorAll('table.details thead th').forEach(th => {
        const arrow = th.querySelector('.arrow');
        if (th.dataset.key === sortKey) {
            arrow.textContent = sortDir === 1 ? '▲' : '▼';
        } else {
            arrow.textContent = '';
        }
    });
}

function renderAll() {
    if (entries.length === 0) {
        document.getElementById('emptyMsg').style.display = 'block';
        document.getElementById('tilesView').style.display = 'none';
        document.getElementById('detailsView').style.display = 'none';
        return;
    }
    renderTiles();
    renderDetails();
}

function setView(view) {
    document.getElementById('tilesView').style.display = (view === 'tiles' && entries.length) ? 'grid' : 'none';
    document.getElementById('detailsView').style.display = (view === 'details' && entries.length) ? 'block' : 'none';
    document.getElementById('btnTiles').classList.toggle('active', view === 'tiles');
    document.getElementById('btnDetails').classList.toggle('active', view === 'details');
    try { localStorage.setItem('explorerView', view); } catch (e) {}
}

document.getElementById('btnTiles').addEventListener('click', () => setView('tiles'));
document.getElementById('btnDetails').addEventListener('click', () => setView('details'));

document.querySelectorAll('table.details thead th').forEach(th => {
    th.addEventListener('click', () => {
        const key = th.dataset.key;
        if (sortKey === key) { sortDir *= -1; } else { sortKey = key; sortDir = 1; }
        renderDetails();
    });
});

renderAll();
let savedView = 'tiles';
try { savedView = localStorage.getItem('explorerView') || 'tiles'; } catch (e) {}
setView(savedView);

// Upload handling (unchanged behavior)
document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    if (!file) return;

    const status = document.getElementById('uploadStatus');
    status.textContent = 'Uploading ' + file.name + '...';
    status.style.color = '#0056b3';

    const currentPath = window.location.pathname;
    const uploadUrl = currentPath + '?upload=true&filename=' + encodeURIComponent(file.name);

    try {
        const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: file
        });

        if (response.ok) {
            status.textContent = '✅ Upload successful! Refreshing...';
            status.style.color = '#28a745';
            setTimeout(() => window.location.reload(), 1000);
        } else {
            const errText = await response.text();
            status.textContent = '❌ Upload failed: ' + errText;
            status.style.color = '#dc3545';
        }
    } catch (err) {
        status.textContent = '❌ Upload error: ' + err.message;
        status.style.color = '#dc3545';
    }
});
</script>
</body>
</html>`;
}

// Port Error Handling Logic
function startServer(p) {
    server.listen(p, '0.0.0.0', () => {
        const HOST_IP = getHotspotAddress();
        console.log(`\n🚀 Server Active on Port ${p}`);
        console.log(`-----------------------------------`);
        console.log(`📂 Root:     ${ROOT_DIR}`);
        console.log(`🏠 Local:    http://localhost:${p}`);
        console.log(`📶 Hotspot:  http://${HOST_IP}:${p}`);
        console.log(`-----------------------------------\n`);
    });
}

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.log(`⚠️  Port ${PORT} is busy, trying ${PORT + 1}...`);
        PORT++;
        startServer(PORT);
    } else {
        console.error(e);
    }
});

// Cleanup on exit
process.on('SIGINT', () => {
    server.close(() => {
        console.log('\n🛑 Server closed.');
        process.exit();
    });
});

startServer(PORT);
