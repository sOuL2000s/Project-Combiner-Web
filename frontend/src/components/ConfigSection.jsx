import { useState, useEffect } from 'react'
import { browseDir } from '../api'

const LS_KEY = 'combiner.lastFolder'

// ---- Capability detection (self-contained, no import dependency) -----------
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

function joinPath(base, name) {
  if (!base) return name
  const sep = base.includes('\\') ? '\\' : '/'
  return base.replace(/[\\/]+$/, '') + sep + name
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
  const [nativeFolder, setNativeFolder] = useState(null)
  const [nativeSaved, setNativeSaved] = useState(null)
  const [nativeAvailable] = useState(detectNativeFS)

  // Keep global handles in sync so App.jsx can access them during combine
  useEffect(() => {
    window.__combinerNativeDirHandle = nativeFolder?.handle || null
  }, [nativeFolder])

  useEffect(() => {
    window.__combinerNativeSaveHandle = nativeSaved?.handle || null
  }, [nativeSaved])

  // Clear stale handles if the user types into the root field
  useEffect(() => {
    if (!state.rootDir.startsWith('[Native folder]')) {
      if (nativeFolder) setNativeFolder(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.rootDir])

  async function handleNativePickFolder() {
    if (!nativeAvailable) {
      addLog('❌ This browser does not support the native folder picker. Use Chrome or Edge.')
      return
    }
    // IMPORTANT: showDirectoryPicker() must be called from a user gesture,
    // and it MUST NOT be awaited before the call. We call it directly.
    let picked
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' })
      picked = { handle, pathHint: handle.name }
    } catch (e) {
      if (e && e.name === 'AbortError') {
        addLog('ℹ️ Native folder picker cancelled.')
        return
      }
      if (e && e.name === 'SecurityError') {
        addLog('❌ Native picker blocked — must be served over https:// or http://localhost')
        return
      }
      addLog(`❌ Native folder error: ${e.name || ''} ${e.message || e}`)
      return
    }
    if (!picked) return
    setNativeFolder(picked)
    setNativeSaved(null)
    setState(s => ({
      ...s,
      rootDir: `[Native folder] ${picked.pathHint}`,
      outputPath: 'combined_project_files.txt'
    }))
    addLog(`📁 Native folder selected: ${picked.pathHint}`)
    addLog('ℹ️ Combine will read files in-browser and save via native save dialog.')
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
    setState(s => ({
      ...s,
      rootDir: '',
      outputPath: ''
    }))
    addLog('🧹 Native folder selection cleared.')
  }

  // ---- Custom in-app browser (fallback + path-based navigation) ------------
  async function loadDir(path) {
    if (!path) {
      addLog('❌ loadDir called with empty path')
      return
    }
    setLoading(true)
    addLog(`📂 Loading: ${path}`)
    try {
      const res = await browseDir(path)
      if (res.success) {
        setEntries(res.entries)
        setCurrentPath(path)
        addLog(`✅ Loaded ${res.entries.length} entries from ${path}`)
        try { localStorage.setItem(LS_KEY, path) } catch {}
      } else {
        addLog(`❌ Browse error: ${res.error || 'unknown'} (path: "${path}")`)
        // Keep currentPath unchanged on failure so the user can still go Up
        setEntries([])
      }
    } catch (e) {
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

  function pickDir(entry) {
    if (!entry || !entry.path) {
      addLog(`❌ Cannot open folder: missing path for "${entry?.name || '?'}"`)
      return
    }
    
    addLog(`🖱️ Clicked folder: ${entry.name}`) 
    
    // 1. Immediately set loading & clear old entries so the user sees a change
    setLoading(true)
    setEntries([])
    
    // 2. Update the path so the breadcrumbs change immediately
    setCurrentPath(entry.path)
    
    // 3. Then fetch the new directory
    loadDir(entry.path)
  }

  function goUp() {
    const parent = parentOf(currentPath)
    if (parent) loadDir(parent)
  }

  function jumpToDrive(drive) {
    // Normalize "C:/" → "C:/" and "C:" → "C:/" so the backend gets a
    // path that resolves cleanly on Windows.
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

  // Windows drive shortcuts
  const drives = navigator.userAgent.includes('Windows')
    ? ['C:/', 'D:/', 'E:/', 'F:/', 'G:/', 'H:/']
    : ['/']

  // Breadcrumb segments
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

  // (removed document-level click delegation — React's onClick on each
  //  .browse-entry button is sufficient and does not hijack other controls)

  const [dragOver, setDragOver] = useState(false)

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
    const item = e.dataTransfer.items?.[0]
    if (!item || item.kind !== 'file' || typeof item.getAsFileSystemHandle !== 'function') {
      addLog('❌ Drag-and-drop of folders requires Chrome or Edge.')
      return
    }
    try {
      const handle = await item.getAsFileSystemHandle()
      if (!handle || handle.kind !== 'directory') {
        addLog('❌ Please drop a folder, not a file.')
        return
      }
      setNativeFolder({ handle, pathHint: handle.name })
      setNativeSaved(null)
      setState(s => ({
        ...s,
        rootDir: `[Native folder] ${handle.name}`,
        outputPath: 'combined_project_files.txt'
      }))
      addLog(`📁 Dropped folder: ${handle.name}`)
    } catch (err) {
      addLog(`❌ Could not read dropped folder: ${err.message || err}`)
    }
  }

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
            placeholder="e.g. D:/72 projects of python/my-project"
          />
          {nativeAvailable && (
            <button
              className="btn btn-secondary"
              onClick={handleNativePickFolder}
              title="Open OS folder picker (Chrome/Edge)"
            >
              📁 Choose Folder
            </button>
          )}
          <button className="btn btn-ghost" onClick={openBrowser} title="In-app browser">
            🗂 Browse
          </button>
        </div>
      </div>

      {state.rootDir && (
        <div className={`mode-badge ${nativeFolder ? 'native' : 'server'}`}>
          {nativeFolder
            ? '🌐 Native mode — reads in your browser, saves via OS dialog'
            : '🖥 Server mode — backend reads the path on disk'}
        </div>
      )}

      {!nativeAvailable && (
        <div className="msg warn" style={{ marginTop: 6 }}>
          ⚠️ Your browser doesn't support the OS-native folder picker.
          Use the 📂 Browse button or Chrome/Edge for native.
        </div>
      )}

      {nativeFolder && (
        <div className="msg ok" style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✅ Native folder: <b>{nativeFolder.pathHint}</b> — combine will run in-browser</span>
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
            {crumbs.map((c, i) => (
              <span key={i}>
                <button className="crumb" onClick={() => loadDir(c.path)}>{c.label}</button>
                {i < crumbs.length - 1 && <span className="crumb-sep">›</span>}
              </span>
            ))}
          </div>
          <div className="browse-actions">
            <button className="ghost" onClick={goUp} disabled={!parentOf(currentPath)}>⬆ Up</button>
            <button className="ghost" onClick={applyCurrentAsRoot}>✅ Use This Folder</button>
            <button className="ghost" onClick={() => setShowBrowse(false)}>✕ Close</button>
          </div>

          <div style={{
            marginTop: '10px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            maxHeight: '240px',
            overflowY: 'auto',
            padding: '8px',
            fontFamily: 'monospace',
            fontSize: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            // THE MISSING MAGIC:
            position: 'relative',
            zIndex: 10,
            pointerEvents: 'auto'
          }}>
            {loading ? (
              <div style={{ opacity: 0.6, padding: '8px' }}>Loading…</div>
            ) : entries.length === 0 ? (
              <div style={{ opacity: 0.6, padding: '8px' }}>
                Empty or unreadable. Check the log panel — click ⬆ Up or ✅ Use This Folder.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                {entries
                  .filter(e => e.isDir)
                  .map(e => (
                    <div
                      key={e.path || e.name}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        color: 'var(--fg)',
                        userSelect: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        border: '1px solid transparent',
                      }}
                      onMouseEnter={(ev) => {
                        ev.currentTarget.style.background = 'var(--bg-elev-2)'
                        ev.currentTarget.style.borderColor = 'var(--border)'
                      }}
                      onMouseLeave={(ev) => {
                        ev.currentTarget.style.background = 'transparent'
                        ev.currentTarget.style.borderColor = 'transparent'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>📁</span>
                        <span>{e.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => pickDir(e)}
                        style={{
                          padding: '4px 8px',
                          cursor: 'pointer',
                          background: 'var(--accent)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                        }}
                      >
                        Enter ➔
                      </button>
                    </div>
                  ))}

                {entries
                  .filter(e => !e.isDir)
                  .map(e => (
                    <div
                      key={e.name}
                      style={{
                        padding: '8px 10px',
                        opacity: 0.5,
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <span>📄</span>
                      <span>{e.name}</span>
                    </div>
                  ))}
              </div>
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
          <button
            className="ghost"
            onClick={handleNativeSaveFile}
            title="Native — opens OS save dialog (Chrome/Edge)"
          >
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