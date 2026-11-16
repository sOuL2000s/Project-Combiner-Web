import { useState } from 'react'
import { searchFiles } from '../api'

export default function SearchSection({ state, setState, addLog }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(new Set())

  async function runSearch() {
    if (!query.trim()) return
    addLog(`🔍 Searching for '${query}'...`)
    const res = await searchFiles({
      root_dir: state.rootDir,
      query: query.trim(),
      excluded_dirs: state.excludedDirs.split(',').map(s => s.trim()).filter(Boolean)
    })
    setResults(res.matches)
    res.log.forEach(addLog)
    if (res.matches.length === 0) addLog('⚠️ No matches found')
  }

  function toggle(name) {
    const s = new Set(selected)
    if (s.has(name)) s.delete(name)
    else s.add(name)
    setSelected(s)
  }

  function addToIncluded() {
    const current = state.includedFiles.split(',').map(s => s.trim()).filter(Boolean)
    const merged = Array.from(new Set([...current, ...selected]))
    setState(s => ({ ...s, includedFiles: merged.join(', ') }))
    addLog(`➕ Added ${selected.size} files to inclusion list`)
    setSelected(new Set())
  }

  return (
    <div className="card">
      <h2>Content-Based Search</h2>
      <div className="row">
        <label>Search Query:</label>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && runSearch()}
        />
        <button onClick={runSearch}>Run</button>
      </div>

      {results.length > 0 && (
        <>
          <div className="search-list">
            {results.map(r => (
              <div
                key={r}
                className={'item ' + (selected.has(r) ? 'selected' : '')}
                onClick={() => toggle(r)}
              >
                {r}
              </div>
            ))}
          </div>
          <button
            className="action-btn"
            onClick={addToIncluded}
            disabled={selected.size === 0}
          >
            Add Selected to Inclusion List ({selected.size})
          </button>
        </>
      )}
    </div>
  )
}