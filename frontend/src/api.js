const BASE = '/api'

export async function health() {
  const r = await fetch(`${BASE}/health`)
  return r.json()
}

// ---- Browser capability detection ------------------------------------------
export function supportsFileSystemAccess() {
  return typeof window !== 'undefined'
    && typeof window.showSaveFilePicker === 'function'
    && typeof window.showDirectoryPicker === 'function'
}

// Native Save File dialog (Chrome/Edge). Returns the chosen file handle or null.
export async function saveFileNative(suggestedName = 'combined_project_files.txt') {
  if (typeof window.showSaveFilePicker !== 'function') return null
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: [{
        description: 'Text file',
        accept: { 'text/plain': ['.txt'] }
      }]
    })
    return handle
  } catch (e) {
    if (e && e.name === 'AbortError') return null
    throw e
  }
}

// Write string contents to a FileSystemFileHandle returned by saveFileNative()
export async function writeToFileHandle(handle, contents) {
  const writable = await handle.createWritable()
  await writable.write(contents)
  await writable.close()
}

// Native folder picker (Chrome/Edge). Returns { handle, pathHint } or null.
// NOTE: Browsers intentionally do NOT expose absolute paths. `pathHint` is just
// the folder's basename for display — the actual combine happens client-side.
export async function pickFolderNative() {
  if (typeof window.showDirectoryPicker !== 'function') return null
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' })
    return { handle, pathHint: handle.name }
  } catch (e) {
    if (e && e.name === 'AbortError') return null
    throw e
  }
}

// Recursively walk a directory handle. Yields { relPath, content } for every
// UTF-8 text file that isn't filtered out. Skips binaries automatically.
export async function* walkDirectoryHandle(dirHandle, opts) {
  const {
    excludedDirs = [],
    excludedFiles = [],
    maxFileSize = 0,
    prefix = ''
  } = opts || {}
  const excludedDirsSet = new Set(excludedDirs)
  const excludedFilesSet = new Set(excludedFiles)

  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'directory') {
      if (excludedDirsSet.has(name)) continue
      yield* walkDirectoryHandle(handle, {
        ...opts,
        prefix: prefix ? `${prefix}/${name}` : name
      })
    } else {
      if (excludedFilesSet.has(name)) continue
      try {
        const file = await handle.getFile()
        if (maxFileSize > 0 && file.size > maxFileSize) continue
        // Read as text; will throw for binary data
        const text = await file.text()
        // Heuristic: if it contains null bytes it's probably binary
        if (text.includes('\u0000')) continue
        yield { relPath: prefix ? `${prefix}/${name}` : name, content: text }
      } catch {
        // Unreadable / binary — skip silently (mirrors desktop behavior)
        continue
      }
    }
  }
}



export async function browseDir(path) {
  const r = await fetch(`${BASE}/browse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  })
  return r.json()
}

export async function combineFiles(payload) {
  const r = await fetch(`${BASE}/combine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return r.json()
}

export async function searchFiles(payload) {
  const r = await fetch(`${BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return r.json()
}

export async function getTree(payload) {
  const r = await fetch(`${BASE}/tree`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return r.json()
}

// Copy text to the clipboard with a DOM fallback for older browsers.
export async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fall through to fallback
    }
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch {}
  document.body.removeChild(ta)
  return ok
}