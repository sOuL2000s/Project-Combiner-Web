// FiltersSection.jsx
// Mirrors the desktop "Include Dirs / Include Files / Exclude Dirs / Exclude Files"
// rows. The +Directory / +File buttons now open an in-app picker that browses
// the Project Root through the backend (/api/browse), instead of the OS file dialog.

import { useState } from 'react'
import { browseDir } from '../api'

function parseList(str) {
  return str.split(',').map(s => s.trim()).filter(Boolean)
}

function joinList(list) {
  return Array.from(new Set(list)).sort().join(', ')
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

export default function FiltersSection({ state, setState, addLog }) {
  const [picker, setPicker] = useState(null) // { key, mode: 'dir'|'file' }
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function openPicker(key) {
    const mode = key.endsWith('Files') ? 'file' : 'dir'
    const root = (state.rootDir || '').trim()
    if (!root || root.startsWith('[Native folder]')) {
      addLog('❌ Set a Project Root (server mode) before using the in-app picker.')
      return
    }
    setPicker({ key, mode })
    setEntries([])
    setError('')
    loadDir(root)
  }

  async function loadDir(path) {
    if (!path) return
    setLoading(true)
    setError('')
    try {
      const res = await browseDir(path)
      if (res && res.success) {
        setEntries(Array.isArray(res.entries) ? res.entries : [])
        setCurrentPath(path)
      } else {
        setError((res && res.error) || 'unknown')
        setEntries([])
      }
    } catch (e) {
      setError(e.message || String(e))
      setEntries([])
    } finally {
      setLoading(false)
    }
  }

  function isDirEntry(e) {
    return e.is_dir === true || e.isDir === true
  }

  function addNamesTo(key, names) {
    if (!names.length) return
    const current = parseList(state[key])
    setState(s => ({ ...s, [key]: joinList([...current, ...names]) }))
    addLog(`➕ Added ${names.length} ${key.endsWith('Files') ? 'file(s)' : 'dir(s)'} to ${key}`)
  }

  function handleDirClick(entry) {
    if (picker.mode === 'dir') {
      // For "include/exclude dirs" we add the *name* and keep browsing so the
      // user can multi-select. Enter = add this dir.
      addNamesTo(picker.key, [entry.name])
    } else {
      // File mode: directories are navigated, files are selected
      loadDir(entry.path)
    }
  }

  function handleEnterDir(entry) {
    // Enter navigates into the folder
    loadDir(entry.path)
  }

  function handleFileClick(entry) {
    if (picker.mode !== 'file') {
      addLog('ℹ️ Switch to a Files filter to select files.')
      return
    }
    addNamesTo(picker.key, [entry.name])
  }

  function closePicker() {
    setPicker(null)
    setEntries([])
    setError('')
  }

  const dirs = entries.filter(isDirEntry)
  const files = entries.filter(e => !isDirEntry(e))

  const rows = [
    { key: 'excludedDirs',  label: 'Exclude Dirs',   hint: '+ 📁 Dir' },
    { key: 'excludedFiles', label: 'Exclude Files',  hint: '+ 📄 File(s)' },
    { key: 'includedDirs',  label: 'Include Dirs',   hint: '+ 📁 Dir' },
    { key: 'includedFiles', label: 'Include Files',  hint: '+ 📄 File(s)' }
  ]

  return (
    <div className="card">
      <h2>Inclusion & Exclusion Filters</h2>

      {rows.map(({ key, label, hint }) => (
        <div className="row" key={key}>
          <label>{label}:</label>
          <input
            type="text"
            value={state[key]}
            onChange={e => setState(s => ({ ...s, [key]: e.target.value }))}
            placeholder="comma separated"
          />
          <button
            className="ghost"
            onClick={() => openPicker(key)}
            title={`Browse and add to ${label}`}
          >
            {hint}
          </button>
        </div>
      ))}

      {picker && (
        <div className="picker-overlay" onClick={closePicker}>
          <div className="picker-modal" onClick={e => e.stopPropagation()}>
            <header>
              <h3>
                Pick {picker.mode === 'dir' ? 'directory' : 'file'} names for{' '}
                <code>{picker.key}</code>
              </h3>
              <button onClick={closePicker}>×</button>
            </header>
            <div className="picker-path">
              <button
                className="ghost"
                onClick={() => loadDir(parentOf(currentPath))}
                disabled={!parentOf(currentPath)}
              >
                ⬆ Up
              </button>
              <code style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentPath || '(no path)'}
              </code>
              <button className="ghost" onClick={closePicker}>Done</button>
            </div>
            {error && <div className="msg err" style={{ margin: '8px 12px' }}>{error}</div>}
            <div className="picker-body">
              {loading ? (
                <div className="browse-empty">Loading…</div>
              ) : entries.length === 0 ? (
                <div className="browse-empty">Empty or unreadable.</div>
              ) : (
                <>
                  {dirs.map(e => (
                    <div key={e.path || e.name} className="browse-item dir">
                      <span
                        className="browse-item-name"
                        onClick={() => handleDirClick(e)}
                        style={{ cursor: 'pointer', flex: 1 }}
                      >
                        📁 {e.name}
                      </span>
                      <button
                        className="browse-enter"
                        onClick={(ev) => { ev.stopPropagation(); handleEnterDir(e) }}
                        title="Open folder"
                      >
                        Enter ➔
                      </button>
                      {picker.mode === 'dir' && (
                        <button
                          className="ghost"
                          onClick={(ev) => { ev.stopPropagation(); addNamesTo(picker.key, [e.name]) }}
                          title="Add this directory name"
                        >
                          + Add
                        </button>
                      )}
                    </div>
                  ))}
                  {files.map(e => (
                    <div key={e.path || e.name} className="browse-item file">
                      <span
                        className="browse-item-name"
                        style={{ flex: 1, cursor: picker.mode === 'file' ? 'pointer' : 'default' }}
                        onClick={() => handleFileClick(e)}
                      >
                        📄 {e.name}
                      </span>
                      {picker.mode === 'file' && (
                        <button
                          className="ghost"
                          onClick={(ev) => { ev.stopPropagation(); addNamesTo(picker.key, [e.name]) }}
                        >
                          + Add
                        </button>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}