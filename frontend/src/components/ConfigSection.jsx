import { useState, useEffect, useRef } from 'react'
import { browseDir } from '../api'

const LS_KEY = 'combiner.lastFolder'

function detectNativeFS() {
  if (typeof window === 'undefined') return false
  try {
    return typeof window.showDirectoryPicker === 'function'
      && typeof window.showSaveFilePicker === 'function'
  } catch {
    return false
  }
}

function autoOutputPath(root) {
  if (!root) return ''
  const sep = root.includes('\\') ? '\\' : '/'
  const clean = root.replace(/[\\/]+$/, '')
  return `${clean}${sep}combined_project_files.txt`
}

function parentOf(path) {
  if (!path) return ''
  const sep = path.includes('\\') ? '\\' : '/'
  const trimmed = path.replace(/[\\/]+$/, '')
  const parts = trimmed.split(/[\\/]/)
  if (parts.length <= 1) return ''
  parts.pop()
  let parent = parts.join(sep)
  if (!parent) parent = sep
  if (/^[a-zA-Z]:$/.test(parent)) parent += sep
  return parent
}

export default function ConfigSection({ state, setState, addLog }) {
  const [showBrowse, setShowBrowse] = useState(false)
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [browseError, setBrowseError] = useState('')
  const [nativeFolder, setNativeFolder] = useState(null)
  const [nativeSaved, setNativeSaved] = useState(null)
  const [nativeAvailable] = useState(detectNativeFS)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    window.__combinerNativeDirHandle = nativeFolder?.handle || null
    window.__combinerNativeFileList = nativeFolder?.fileList || null
    window.__combinerNativeEntry = nativeFolder?.entry || null
  }, [nativeFolder])

  useEffect(() => {
    window.__combinerNativeSaveHandle = nativeSaved?.handle || null
  }, [nativeSaved])

  useEffect(() => {
    if (!state.rootDir.startsWith('[Native folder]') && !state.rootDir.startsWith('[Selected folder]')) {
      if (nativeFolder) setNativeFolder(null)
    }
  }, [state.rootDir])

  async function handleNativePickFolder() {
    if (nativeAvailable) {
      try {
        const handle = await window.showDirectoryPicker({ mode: 'read' })
        const picked = { handle, pathHint: handle.name }
        setNativeFolder(picked)
        setNativeSaved(null)
        setState(s => ({
          ...s,
          rootDir: `[Native folder] ${picked.pathHint}`,
          outputPath: 'combined_project_files.txt'
        }))
        addLog(`📁 Native folder selected: ${picked.pathHint}`)
        return
      } catch (e) {
        if (e && e.name === 'AbortError') {
          addLog('ℹ️ Native folder picker cancelled.')
          return
        }
        addLog(`❌ Native folder error: ${e.name || ''} ${e.message || e}. Falling back to standard upload.`)
      }
    }
    
    // Fallback to standard input
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  function handleFileInputChange(e) {
    const files = e.target.files
    if (!files || files.length === 0) return
    
    // Get the root folder name from the first file's relative path
    const firstPath = files[0].webkitRelativePath
    const folderName = firstPath.split('/')[0] || 'Selected Folder'
    
    const picked = { fileList: files, pathHint: folderName }
    setNativeFolder(picked)
    setNativeSaved(null)
    setState(s => ({
      ...s,
      rootDir: `[Selected folder] ${folderName}`,
      outputPath: 'combined_project_files.txt'
    }))
    addLog(`📁 Folder selected via upload: ${folderName} (${files.length} files)`)
  }

  async function handleNativeSaveFile() {
    if (!nativeAvailable) {
      addLog('❌ This browser does not support the native save dialog.')
      return
    }
    const suggested =
      (state.outputPath.split(/[\\/]/).pop() || '').trim() ||
      'combined_project_files.txt'
    let handle
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: suggested,
        types: [{ description: 'Text file', accept: { 'text/plain': ['.txt'] } }]
      })
    } catch (e) {
      if (e && e.name === 'AbortError') {
        addLog('ℹ️ Save dialog cancelled.')
        return
      }
      addLog(`❌ Save dialog error: ${e.name || ''} ${e.message || e}`)
      return
    }
    if (!handle) return
    setNativeSaved({ handle })
    setState(s => ({ ...s, outputPath: `[Native file] ${handle.name}` }))
    addLog(`💾 Save target set: ${handle.name}`)
  }

  function clearNativeFolder() {
    setNativeFolder(null)
    setNativeSaved(null)
    setState(s => ({ ...s, rootDir: '', outputPath: '' }))
    addLog('🧹 Native folder selection cleared.')
  }

  // Robust directory loader — does NOT clear entries until the request resolves
  async function loadDir(path) {
    if (!path) {
      addLog('❌ loadDir called with empty path')
      return
    }
    setLoading(true)
    setBrowseError('')
    addLog(`📂 Loading: ${path}`)
    try {
      const res = await browseDir(path)
      if (res && res.success) {
        setEntries(Array.isArray(res.entries) ? res.entries : [])
        setCurrentPath(path)
        addLog(`✅ Loaded ${res.entries.length} entries from ${path}`)
        try { localStorage.setItem(LS_KEY, path) } catch {}
      } else {
        const msg = (res && res.error) || 'unknown'
        setBrowseError(msg)
        addLog(`❌ Browse error: ${msg} (path: "${path}")`)
        setEntries([])
      }
    } catch (e) {
      setBrowseError(e.message || String(e))
      addLog(`❌ Browse request failed: ${e.message || e} (path: "${path}")`)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }

  function openBrowser() {
    let start = state.rootDir.trim()
    if (start.startsWith('[Native folder]') || !start) {
      try { start = localStorage.getItem(LS_KEY) || '' } catch {}
    }
    if (!start) {
      start = navigator.userAgent.includes('Windows') ? 'C:/' : '/'
    }
    setShowBrowse(true)
    loadDir(start)
  }

  // Navigate into a folder (does NOT clear entries first — smooth UX)
  function pickDir(entry) {
    if (!entry || !entry.path) {
      addLog(`❌ Cannot open folder: missing path for "${entry?.name || '?'}"`)
      return
    }
    addLog(`🖱️ Opening folder: ${entry.name}`)
    loadDir(entry.path)
  }

  function goUp() {
    const parent = parentOf(currentPath)
    if (parent) loadDir(parent)
  }

  function jumpToDrive(drive) {
    const normalized = /^[a-zA-Z]:$/.test(drive) ? drive + '/' : drive
    addLog(`📂 Jumping to drive: ${normalized}`)
    loadDir(normalized)
  }

  function applyCurrentAsRoot() {
    const newOutput = autoOutputPath(currentPath)
    setNativeFolder(null)
    setState(s => ({ ...s, rootDir: currentPath, outputPath: newOutput }))
    addLog(`✅ Project root set to: ${currentPath}`)
    addLog(`📝 Output path set to: ${newOutput}`)
    setShowBrowse(false)
  }

  const drives = navigator.userAgent.includes('Windows')
    ? ['C:/', 'D:/', 'E:/', 'F:/', 'G:/', 'H:/']
    : ['/']

  const sep = currentPath.includes('\\') ? '\\' : '/'
  const crumbs = (() => {
    if (!currentPath) return []
    const trimmed = currentPath.replace(/[\\/]+$/, '')
    const parts = trimmed.split(/[\\/]/).filter(Boolean)
    if (navigator.userAgent.includes('Windows') && /^[a-zA-Z]:/.test(parts[0] || '')) {
      const out = [{ label: parts[0] + '/', path: parts[0] + '/' }]
      let acc = parts[0]
      for (let i = 1; i < parts.length; i++) {
        acc += sep + parts[i]
        out.push({ label: parts[i], path: acc })
      }
      return out
    }
    const out = [{ label: '/', path: '/' }]
    let acc = ''
    for (const p of parts) {
      acc += sep + p
      out.push({ label: p, path: acc })
    }
    return out
  })()

  function onDragOver(e) {
    e.preventDefault()
    setDragOver(true)
  }

  function onDragLeave(e) {
    e.preventDefault()
    setDragOver(false)
  }

  async function onDrop(e) {
    e.preventDefault()
    setDragOver(false)
    
    const items = e.dataTransfer.items
    if (!items || items.length === 0) return

    // Try File System Access API first (Chrome/Edge)
    if (typeof items[0].getAsFileSystemHandle === 'function') {
      try {
        const handle = await items[0].getAsFileSystemHandle()
        if (handle && handle.kind === 'directory') {
          setNativeFolder({ handle, pathHint: handle.name })
          setNativeSaved(null)
          setState(s => ({
            ...s,
            rootDir: `[Native folder] ${handle.name}`,
            outputPath: 'combined_project_files.txt'
          }))
          addLog(`📁 Dropped folder (native): ${handle.name}`)
          return
        }
      } catch (err) {
        console.warn('getAsFileSystemHandle failed', err)
      }
    }

    // Fallback to webkitGetAsEntry (Chrome, Firefox, Safari)
    if (typeof items[0].webkitGetAsEntry === 'function') {
      const entry = items[0].webkitGetAsEntry()
      if (entry && entry.isDirectory) {
        setNativeFolder({ entry, pathHint: entry.name })
        setNativeSaved(null)
        setState(s => ({
          ...s,
          rootDir: `[Dropped folder] ${entry.name}`,
          outputPath: 'combined_project_files.txt'
        }))
        addLog(`📁 Dropped folder: ${entry.name}`)
        return
      }
    }

    // Last resort: standard files (will be treated as a list of files)
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      const picked = { fileList: files, pathHint: 'Dropped Files' }
      setNativeFolder(picked)
      setNativeSaved(null)
      setState(s => ({
        ...s,
        rootDir: `[Dropped files]`,
        outputPath: 'combined_project_files.txt'
      }))
      addLog(`📁 Dropped ${files.length} files`)
    }
  }

  // Backend serializes is_dir (snake_case). Handle both defensively.
  const isDir = (e) => e.is_dir === true || e.isDir === true

  const dirs = entries.filter(isDir)
  const files = entries.filter(e => !isDir(e))

  return (
    <div
      className={'card' + (dragOver ? ' drag-over' : '')}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <h2>Configuration</h2>

      <div className="row">
        <label>Project Root:</label>
        <div className="input-group">
          <input
            type="text"
            value={state.rootDir}
            onChange={e => {
              const newRoot = e.target.value
              setNativeFolder(null)
              setNativeSaved(null)
              setState(s => {
                const shouldAutoFill =
                  !s.outputPath || s.outputPath === autoOutputPath(s.rootDir)
                return {
                  ...s,
                  rootDir: newRoot,
                  outputPath: shouldAutoFill && newRoot
                    ? autoOutputPath(newRoot)
                    : s.outputPath
                }
              })
            }}
            placeholder="e.g. D:/my-project or select a folder"
          />
          <input
            type="file"
            webkitdirectory="true"
            directory="true"
            multiple
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileInputChange}
          />
          <button className="btn btn-primary" onClick={handleNativePickFolder}>
            📁 Select Folder
          </button>
          <button className="btn btn-ghost" onClick={openBrowser}>
            🗂 Browse Server
          </button>
        </div>
      </div>

      {state.rootDir && (
        <div className={`mode-badge ${nativeFolder ? 'native' : 'server'}`}>
          {nativeFolder
            ? '🌐 Upload mode — files are uploaded and processed by the backend'
            : '🖥 Server mode — backend reads the path from the server disk'}
        </div>
      )}

      {nativeFolder && (
        <div className="msg ok" style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span>✅ Native folder: <b>{nativeFolder.pathHint}</b></span>
          <button className="ghost" onClick={clearNativeFolder} style={{ padding: '2px 10px', fontSize: 12 }}>
            Clear
          </button>
        </div>
      )}

      {showBrowse && (
        <div className="browse-panel">
          <div className="browse-drives">
            {drives.map(d => (
              <button key={d} className="ghost" onClick={() => jumpToDrive(d)}>{d}</button>
            ))}
          </div>

          <div className="browse-crumbs">
            {crumbs.length === 0 ? (
              <span className="crumb-sep">(no path)</span>
            ) : (
              crumbs.map((c, i) => (
                <span key={i}>
                  <button className="crumb" onClick={() => loadDir(c.path)}>{c.label}</button>
                  {i < crumbs.length - 1 && <span className="crumb-sep">›</span>}
                </span>
              ))
            )}
          </div>

          <div className="browse-actions">
            <button className="ghost" onClick={goUp} disabled={!parentOf(currentPath)}>⬆ Up</button>
            <button className="ghost" onClick={applyCurrentAsRoot} disabled={!currentPath}>
              ✅ Use This Folder
            </button>
            <button className="ghost" onClick={() => setShowBrowse(false)}>✕ Close</button>
          </div>

          {browseError && (
            <div className="msg err" style={{ marginBottom: 8, fontSize: 12 }}>
              ⚠️ {browseError}
            </div>
          )}

          <div className="browse-list">
            {loading ? (
              <div className="browse-empty">Loading…</div>
            ) : entries.length === 0 ? (
              <div className="browse-empty">Empty or unreadable.</div>
            ) : (
              <>
                {dirs.map(e => (
                  <div
                    key={e.path || e.name}
                    className="browse-item dir"
                    onClick={() => pickDir(e)}
                    title={`Open ${e.name}`}
                  >
                    <span className="browse-item-name">📁 {e.name}</span>
                    <button
                      className="browse-enter"
                      onClick={(ev) => { ev.stopPropagation(); pickDir(e) }}
                    >
                      Enter ➔
                    </button>
                  </div>
                ))}
                {files.map(e => (
                  <div key={e.path || e.name} className="browse-item file">
                    <span className="browse-item-name">📄 {e.name}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      <div className="row">
        <label>Output Path:</label>
        <input
          type="text"
          value={state.outputPath}
          onChange={e => {
            setNativeSaved(null)
            setState(s => ({ ...s, outputPath: e.target.value }))
          }}
          placeholder="Full path to output .txt file"
        />
        {nativeAvailable && (
          <button className="ghost" onClick={handleNativeSaveFile}>
            💾 Save As
          </button>
        )}
      </div>

      {nativeSaved && (
        <div className="msg ok" style={{ marginTop: 6 }}>
          💾 Native save target: <b>{nativeSaved.handle.name}</b>
        </div>
      )}

      <div className="checkbox-row">
        <label>
          <input
            type="checkbox"
            checked={state.includeStats}
            onChange={e => setState(s => ({ ...s, includeStats: e.target.checked }))}
          />
          Include file stats
        </label>
        <label>
          <input
            type="checkbox"
            checked={state.sortFiles}
            onChange={e => setState(s => ({ ...s, sortFiles: e.target.checked }))}
          />
          Sort files
        </label>
        <label>
          <input
            type="checkbox"
            checked={state.useGitignore}
            onChange={e => setState(s => ({ ...s, useGitignore: e.target.checked }))}
          />
          Respect .gitignore
        </label>
      </div>

      <div className="row">
        <label>Max File Size (bytes):</label>
        <input
          type="text"
          value={state.maxFileSize}
          onChange={e => setState(s => ({ ...s, maxFileSize: e.target.value }))}
          placeholder="0 = no limit"
        />
      </div>
    </div>
  )
}