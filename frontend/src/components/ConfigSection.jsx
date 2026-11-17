import { useState, useEffect, useRef } from 'react'

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

export default function ConfigSection({ state, setState, addLog }) {
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