# 📁 Project File Combiner Pro — Web Edition

[![Live Demo](https://img.shields.io/badge/Live_Demo-Online-brightgreen?style=for-the-badge&logo=render)](https://project-combiner-web.onrender.com/)

> **Try it now:** [project-combiner-web.onrender.com](https://project-combiner-web.onrender.com/)

A full-featured web port of the **Project File Combiner** desktop app.  
Feed an entire codebase into a single consolidated `.txt` file — complete with a directory tree header, per-file metadata, duplicate detection, and content search — all from your browser.

Built with **React + Vite** on the frontend and **Rust (Axum)** on the backend.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🌳 **Directory tree header** | Generates a visual tree of the project at the top of the output |
| 📄 **File contents section** | Concatenates every included file with clear START/END delimiters |
| 🎯 **Include / exclude filters** | Filter by directory basename or by filename |
| 🔍 **Content-based search** | Grep through file contents, then add matching files to the include list |
| 📊 **File stats** | Optional `size`, `line count`, and `modified` timestamp per file |
| ⚠️ **Duplicate detection** | Flags files with identical content using a hash |
| 📏 **Max file size guard** | Skip huge binaries or generated files |
| 🔃 **Sort files** | Deterministic output ordering by relative path |
| 🗑️ **Binary skip** | Non-UTF-8 files are silently skipped and logged |
| 🔗 **Symlink skip** | Symbolic links are ignored to prevent cycles |
| 🚫 **.gitignore support** | Optional — respects `.gitignore` patterns (see Upgrade section) |
| 🌙 **Dark / Light themes** | Instantly toggle between color schemes |
| 📋 **Execution log** | Real-time status of every included, skipped, or errored file |
| 📦 **Summary block** | Total file count, total size, duplicate list at the end of output |

---

## 🧱 Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite 5, vanilla CSS (themeable via CSS vars) |
| Backend | Rust 2021, Axum 0.7, Tokio, WalkDir, Chrono, Serde |
| Transport | HTTP / JSON (REST) |
| CORS | Permissive — bound to localhost during dev |

---

## 📂 Project Structure

```
project-combiner-web/
├── .gitignore
├── README.md
│
├── backend/
│   ├── Cargo.toml
│   ├── .gitignore
│   └── src/
│       ├── main.rs          # Axum router + endpoints
│       ├── models.rs        # Serde request/response structs
│       ├── combiner.rs      # Core file-combining logic
│       ├── tree.rs          # Recursive directory tree generator
│       └── search.rs        # Content search
│
└── frontend/
    ├── .gitignore
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── api.js
        ├── index.css
        └── components/
            ├── Header.jsx
            ├── ConfigSection.jsx
            ├── FiltersSection.jsx
            ├── SearchSection.jsx
            ├── FileTree.jsx
            ├── PreviewModal.jsx
            └── LogPanel.jsx
```

---

## 🚀 Getting Started

### 1. Prerequisites

- **Rust** — install via [rustup](https://rustup.rs/)
  ```bash
  rustc --version   # 1.75+ recommended
  ```
- **Node.js 18+** and npm
  ```bash
  node --version
  npm --version
  ```

### 2. Backend

```bash
cd backend
cargo run
```

You'll see:
```
INFO project_combiner_backend: Listening on 127.0.0.1:8787
```

The Rust API is now serving at `http://127.0.0.1:8787`.

### 3. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Vite will start on **http://localhost:5173**.  
The dev server proxies `/api/*` requests to the Rust backend (see `vite.config.js`), so no CORS issues during development.

### 4. Open the app

Navigate to **http://localhost:5173** in your browser.

---

## 🖱️ Usage Walkthrough

1. **Project Root**  
   Enter the absolute path to your project, e.g.:
   - Linux/macOS: `/home/you/code/myapp`
   - Windows: `C:\Users\you\code\myapp` (use forward slashes in JSON: `C:/Users/you/code/myapp`)

   Or click **Select Folder** to pick a folder from your local machine.

2. **Output Path**  
   Where the combined `.txt` file will be written. Default is `combined_project_files.txt` in the root.

3. **Filters**  
   - **Exclude Dirs**: `node_modules, .git, dist, build`
   - **Exclude Files**: `package-lock.json, yarn.lock, *.log`
   - **Include Dirs / Files**: if set, only these are included (exclusions still apply)

4. **Search (optional)**  
   Type a keyword → **Run**. Matching files appear in a list.  
   Select any → **Add Selected to Inclusion List** to auto-populate the include field.

5. **Options**  
   - ✅ **Include file stats** — adds `Size | Lines | Modified` per file header
   - ✅ **Sort files** — alphabetical path order
   - ✅ **Respect .gitignore** — see upgrade note below
   - **Max File Size** — e.g. `1048576` for 1 MB; `0` = no limit

6. **Generate Tree** (optional preview)  
   Click **Generate Tree** to preview the directory structure before combining.

7. **Combine**  
   Click **COMBINE ALL SELECTED FILES**. The log panel shows real-time progress.  
   The output file is written to your specified path.

---

## 🔌 API Reference

All endpoints accept `POST` with JSON bodies (except `/health`).

### `GET /api/health`
```json
{ "status": "ok" }
```

### `POST /api/browse`
```json
// request
{ "path": "C:/projects/myapp" }

// response
{
  "success": true,
  "error": null,
  "entries": [
    { "name": "src", "is_dir": true },
    { "name": "README.md", "is_dir": false }
  ]
}
```

### `POST /api/tree`
```json
// request
{
  "root_dir": "C:/projects/myapp",
  "excluded_dirs": ["node_modules", ".git"],
  "excluded_files": ["yarn.lock"],
  "included_dirs": [],
  "included_files": [],
  "use_gitignore": false
}

// response
{
  "success": true,
  "tree": "myapp/\n├── src/\n│   └── main.rs\n└── README.md",
  "error": null
}
```

### `POST /api/search`
```json
// request
{
  "root_dir": "C:/projects/myapp",
  "query": "TODO",
  "excluded_dirs": ["node_modules"]
}

// response
{
  "matches": ["C:/projects/myapp/src/main.rs"],
  "log": ["Found 1 matches for 'TODO'"]
}
```

### `POST /api/combine`
```json
// request
{
  "root_dir": "C:/projects/myapp",
  "output_path": "C:/projects/myapp/combined_project_files.txt",
  "excluded_dirs": ["node_modules", ".git"],
  "excluded_files": ["package-lock.json"],
  "included_dirs": [],
  "included_files": [],
  "max_file_size": null,
  "include_stats": true,
  "sort_files": true,
  "use_gitignore": false
}

// response
{
  "success": true,
  "output_path": "C:/projects/myapp/combined_project_files.txt",
  "files_processed": 42,
  "total_size": 128403,
  "duplicates": [
    { "file": "src/old.rs", "original": "src/new.rs" }
  ],
  "log": [
    "🚀 Starting from: C:/projects/myapp",
    "✅ Included: src/main.rs",
    "..."
  ]
}
```

---

## 🎨 Theming

Colors are driven by CSS custom properties in `frontend/src/index.css`:

```css
:root {
  --bg: #0f172a;
  --bg2: #1e293b;
  --fg: #f1f5f9;
  --accent: #60a5fa;
  /* ... */
}
body.light {
  --bg: #f0f2f5;
  --bg2: #ffffff;
  --fg: #1a1a2e;
  --accent: #4a6fa5;
}
```

Toggle is handled by adding/removing the `light` class on `<body>` in `App.jsx`.  
Edit these variables to rebrand the app instantly.

---

## ⚡ Upgrade: Full `.gitignore` Support

The web port exposes a **Respect .gitignore** toggle. The `ignore` crate is already in `Cargo.toml`, but `combiner.rs` currently uses `WalkDir` directly. To fully activate it, replace this block in `backend/src/combiner.rs`:

```rust
let walker = WalkDir::new(root).follow_links(false);
for entry in walker.into_iter().filter_map(|e| e.ok()) {
    // ...
}
```

with:

```rust
use ignore::WalkBuilder;

let mut builder = WalkBuilder::new(root);
builder.follow_links(false);
builder.git_ignore(req.use_gitignore);
builder.git_global(req.use_gitignore);
builder.git_exclude(req.use_gitignore);
builder.hidden(false);

for entry in builder.build().filter_map(|e| e.ok()) {
    if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
        continue;
    }
    let path = entry.path();
    // ... same downstream logic
}
```

The API contract doesn't change, and the frontend toggle starts working immediately.

---

## 🐛 Troubleshooting

| Problem | Fix |
|---|---|
| `cargo run` fails on Windows with path issue | Use forward slashes in paths (`C:/x/y`) or escape backslashes |
| Frontend shows "Directory not found" | Verify the Rust backend is running on port 8787 |
| CORS errors in browser console | Make sure `cors = CorsLayer::new()...` is present in `main.rs` |
| Output file empty | Check that include/exclude filters aren't too aggressive |
| Binary files cause errors | They're skipped automatically — check the log for `⚠️` messages |
| Port 8787 already in use | Change the `SocketAddr` in `main.rs` and the proxy in `vite.config.js` |
| Theme not switching | Ensure `document.body.className = theme` runs in `App.jsx` (check `useEffect`) |

---

## 📦 Building for Production

### Backend

```bash
cd backend
cargo build --release
./target/release/project-combiner-backend
```

### Frontend

```bash
cd frontend
npm run build
```

Output goes to `frontend/dist/`. Serve it with any static host (nginx, Caddy, Netlify, Cloudflare Pages).  
If serving the frontend separately from the backend, update the API base URL in `frontend/src/api.js`:

```js
const BASE = 'https://your-backend.example.com/api'
```

And add the deployment origin to `CorsLayer` in `main.rs`:

```rust
let cors = CorsLayer::new()
    .allow_origin("https://your-frontend.example.com".parse::<HeaderValue>().unwrap())
    .allow_methods(Any)
    .allow_headers(Any);
```

---

## ⚠️ Security Notes

This app **reads and writes arbitrary filesystem paths** by design — it's a developer tool.  
If you deploy it publicly:

1. **Bind to `127.0.0.1` only** (default) — do **not** expose port 8787 to the internet.
2. **Add auth** if multi-user: a simple `Authorization` header check in `main.rs`.
3. **Restrict allowed roots** — validate `req.root_dir` starts with an allow-list prefix.
4. **Rate-limit** the `/api/combine` endpoint to prevent disk-fill abuse.
5. **Review output paths** — a malicious client could write to `~/.ssh/authorized_keys`. Sanitize `output_path`.

For local developer use on `localhost`, none of the above is necessary.

---

## 🗺️ Roadmap / Possible Extensions

- [ ] Drag-and-drop folder upload (browser FileSystemAccess API)
- [ ] Server-sent events for live log streaming (replace fire-and-poll)
- [ ] Save / load "project profiles" (like `last_session.json` in the desktop app)
- [ ] Regex-based exclude patterns (glob → regex bridge)
- [ ] Per-file checkbox selection in the tree
- [ ] Output as `.md` with syntax highlighting
- [ ] Download output directly from browser instead of writing to disk

---

## 📄 License

MIT — free to use, modify, and redistribute.

---

## 🙏 Credits

Original desktop app: **Project File Combiner** (`project_combiner.py`).  
Web port: React + Vite + Rust (Axum).
