import { useState, useEffect } from 'react'
import {
  getTree,
  buildTreeView,
  walkDirectoryHandle as walkDirHandle,
  walkFileList,
  walkEntry,
  parseGitignore
} from '../api'

export default function FileTree({ state, addLog }) {
  const [tree, setTree] = useState('')
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(true)

  useEffect(() => {
    setTree('')
    setCollapsed(true)
  }, [state.rootDir])

  const isBrowserMode =
    window.__combinerNativeDirHandle ||
    window.__combinerNativeFileList ||
    window.__combinerNativeEntry ||
    state.rootDir.startsWith('[Native') ||
    state.rootDir.startsWith('[Selected') ||
    state.rootDir.startsWith('[Dropped')

  async function handleToggleTree() {
    if (!collapsed) {
      setCollapsed(true)
      return
    }

    if (tree) {
      setCollapsed(false)
      return
    }

    setLoading(true)
    addLog('🌳 Generating project tree...')

    try {
      if (isBrowserMode) {
        const dirHandle = window.__combinerNativeDirHandle
        const fileList = window.__combinerNativeFileList
        const entry = window.__combinerNativeEntry

        const excludedDirs = state.excludedDirs.split(',').map(s => s.trim()).filter(Boolean)
        const excludedFiles = state.excludedFiles.split(',').map(s => s.trim()).filter(Boolean)
        const includedDirs = state.includedDirs.split(',').map(s => s.trim()).filter(Boolean)
        const includedFiles = state.includedFiles.split(',').map(s => s.trim()).filter(Boolean)
        const maxSize = parseInt(state.maxFileSize) || 0
        const useInclude = includedDirs.length > 0 || includedFiles.length > 0

        let gitignorePatterns = []
        if (state.useGitignore) {
          try {
            let giText = ''
            if (dirHandle) {
              const giHandle = await dirHandle.getFileHandle('.gitignore')
              const giFile = await giHandle.getFile()
              giText = await giFile.text()
            } else if (fileList) {
              const giFile = Array.from(fileList).find(f => f.name === '.gitignore' || f.webkitRelativePath.endsWith('/.gitignore'))
              if (giFile) giText = await giFile.text()
            }
            if (giText) gitignorePatterns = parseGitignore(giText)
          } catch {}
        }

        const walkOpts = { excludedDirs, excludedFiles, maxFileSize: maxSize, gitignorePatterns }
        const files = []
        let rootName = 'project'

        if (dirHandle) {
          rootName = dirHandle.name
          for await (const item of walkDirHandle(dirHandle, walkOpts)) files.push(item)
        } else if (fileList) {
          rootName = fileList[0]?.webkitRelativePath.split('/')[0] || 'project'
          for await (const item of walkFileList(fileList, walkOpts)) files.push(item)
        } else if (entry) {
          rootName = entry.name
          for await (const item of walkEntry(entry, walkOpts)) files.push(item)
        }

        if (useInclude) {
          const filtered = files.filter(item => {
            const parts = item.relPath.split('/')
            const name = parts[parts.length - 1]
            const dirParts = parts.slice(0, -1)
            if (includedFiles.length > 0) return includedFiles.includes(name)
            if (includedDirs.length > 0) return dirParts.some(p => includedDirs.includes(p))
            return true
          })
          files.length = 0
          files.push(...filtered)
        }

        const treeStr = buildTreeView(files, rootName)
        setTree(treeStr)
        setCollapsed(false)
        addLog(`✅ Tree generated (${files.length} items)`)
      } else {
        if (!state.rootDir.trim()) {
          addLog('❌ Root directory is empty. Pick or enter a folder path first.')
          setLoading(false)
          return
        }
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
          setCollapsed(false)
          addLog('✅ Tree generated')
        } else {
          addLog(`❌ Tree error: ${res.error}`)
        }
      }
    } catch (e) {
      addLog(`❌ Tree error: ${e.message || e}`)
    } finally {
      setLoading(false)
    }
  }

  function handleRefreshTree() {
    setTree('')
    setCollapsed(true)
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Project Tree Preview</h2>
        {tree && (
          <button className="btn btn-ghost" onClick={handleRefreshTree} style={{ fontSize: 12, padding: '2px 8px' }}>
            🔄 Refresh
          </button>
        )}
      </div>

      <button
        className="action-btn"
        style={{
          background: 'var(--bg2)',
          color: 'var(--fg)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8
        }}
        onClick={handleToggleTree}
        disabled={loading}
      >
        {loading ? (
          <><span className="spinner" /> Generating Tree…</>
        ) : (
          <>{collapsed ? '🌳 Show / Generate Tree ▼' : '🌳 Collapse Tree ▲'}</>
        )}
      </button>

      {!collapsed && tree && (
        <div style={{ marginTop: 12 }}>
          <pre className="tree">{tree}</pre>
        </div>
      )}
    </div>
  )
}
