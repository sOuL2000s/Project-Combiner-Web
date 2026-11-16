import { useState } from 'react'
import { getTree } from '../api'

export default function FileTree({ state, addLog }) {
  const [tree, setTree] = useState('')
  const [loading, setLoading] = useState(false)

  async function loadTree() {
    setLoading(true)
    addLog('🌳 Loading project tree...')
    const res = await getTree({
      root_dir: state.rootDir,
      excluded_dirs: state.excludedDirs.split(',').map(s => s.trim()).filter(Boolean),
      excluded_files: state.excludedFiles.split(',').map(s => s.trim()).filter(Boolean),
      included_dirs: state.includedDirs.split(',').map(s => s.trim()).filter(Boolean),
      included_files: state.includedFiles.split(',').map(s => s.trim()).filter(Boolean),
      use_gitignore: state.useGitignore
    })
    if (res.success) {
      setTree(res.tree)
      addLog('✅ Tree generated')
    } else {
      addLog(`❌ Tree error: ${res.error}`)
    }
    setLoading(false)
  }

  return (
    <div className="card">
      <h2>Project Tree Preview</h2>
      <button className="action-btn" onClick={loadTree} disabled={loading}>
        {loading ? 'Loading...' : 'Generate Tree'}
      </button>
      {tree && <pre className="tree">{tree}</pre>}
    </div>
  )
}