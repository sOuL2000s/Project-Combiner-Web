// FiltersSection.jsx
// Mirrors the desktop "Include Dirs / Include Files / Exclude Dirs / Exclude Files"
// rows — now with the +Directory and +File browse buttons that the Tkinter app had.

function parseList(str) {
  return str.split(',').map(s => s.trim()).filter(Boolean)
}

function joinList(list) {
  // dedupe + sort for stable UX
  return Array.from(new Set(list)).sort().join(', ')
}

export default function FiltersSection({ state, setState }) {
  // Native pickers return FileSystemFileHandle[] / FileSystemDirectoryHandle[]
  // — we only need the basename, which is safe on every browser.
  async function pickNativeFiles() {
    if (typeof window.showOpenFilePicker !== 'function') {
      alert('This browser does not support the native file picker. Use Chrome or Edge.')
      return []
    }
    try {
      const handles = await window.showOpenFilePicker({ multiple: true })
      return handles.map(h => h.name)
    } catch (e) {
      if (e && e.name === 'AbortError') return []
      alert(`File picker error: ${e.message || e}`)
      return []
    }
  }

  async function pickNativeDir() {
    if (typeof window.showDirectoryPicker !== 'function') {
      alert('This browser does not support the native folder picker. Use Chrome or Edge.')
      return null
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' })
      return handle.name
    } catch (e) {
      if (e && e.name === 'AbortError') return null
      alert(`Folder picker error: ${e.message || e}`)
      return null
    }
  }

  async function addNames(key, names) {
    if (!names.length) return
    const current = parseList(state[key])
    setState(s => ({ ...s, [key]: joinList([...current, ...names]) }))
  }

  async function browseInto(key) {
    if (key === 'excludedFiles' || key === 'includedFiles') {
      const names = await pickNativeFiles()
      addNames(key, names)
    } else {
      const name = await pickNativeDir()
      if (name) addNames(key, [name])
    }
  }

  // Fallback prompt if native picker unavailable
  function browseFallback(key) {
    const isFile = key.endsWith('Files')
    const input = window.prompt(
      `Enter ${isFile ? 'file name(s)' : 'directory name(s)'} to add (comma-separated):`
    )
    if (!input) return
    addNames(key, parseList(input))
  }

  const rows = [
    { key: 'excludedDirs',  label: 'Exclude Dirs',   hint: '+ 📁 Dir' },
    { key: 'excludedFiles', label: 'Exclude Files',  hint: '+ 📄 File(s)' },
    { key: 'includedDirs',  label: 'Include Dirs',   hint: '+ 📁 Dir' },
    { key: 'includedFiles', label: 'Include Files',  hint: '+ 📄 File(s)' }
  ]

  const nativeFS =
    typeof window !== 'undefined' &&
    (typeof window.showDirectoryPicker === 'function' ||
     typeof window.showOpenFilePicker === 'function')

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
            onClick={() => (nativeFS ? browseInto(key) : browseFallback(key))}
            title={nativeFS ? hint : 'Type entry manually'}
          >
            {hint}
          </button>
        </div>
      ))}

      {!nativeFS && (
        <div className="msg warn" style={{ marginTop: 6, fontSize: 12 }}>
          ℹ️ Native file/folder picker not available in this browser.
          Buttons will prompt for manual input instead.
        </div>
      )}
    </div>
  )
}