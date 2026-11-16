import { useState, useEffect } from 'react'
import Header from './components/Header'
import ConfigSection from './components/ConfigSection'
import FiltersSection from './components/FiltersSection'
import SearchSection from './components/SearchSection'
import FileTree from './components/FileTree'
import LogPanel from './components/LogPanel'
import PreviewModal from './components/PreviewModal'
import { combineFiles, copyToClipboard, walkDirectoryHandle as walkDirHandle, parseGitignore } from './api'

const DEFAULT_STATE = {
  rootDir: '',
  outputPath: '',
  excludedDirs: 'node_modules, .git, .vscode, .idea, dist, build, target, venv, .venv, env, __pycache__, .next, .nuxt, .cache, coverage, .DS_Store',
  excludedFiles: 'package-lock.json, yarn.lock, bun.lockb, pnpm-lock.yaml, Cargo.lock, .DS_Store, Thumbs.db, pyproject.toml, combined_project_files.txt',
  includedDirs: '',
  includedFiles: '',
  maxFileSize: '0',
  includeStats: true,
  sortFiles: true,
  useGitignore: false
}


async function writeToHandle(handle, contents) {
  const writable = await handle.createWritable()
  await writable.write(contents)
  await writable.close()
}

function buildTreeView(files, rootName) {
  const treePaths = new Set()
  for (const f of files) {
    const parts = f.relPath.split('/')
    for (let i = 1; i <= parts.length; i++) {
      treePaths.add(parts.slice(0, i).join('/'))
    }
  }
  const lines = [`${rootName}/`]
  const sorted = Array.from(treePaths).sort()
  for (const p of sorted) {
    const depth = p.split('/').length - 1
    const isFile = files.some(f => f.relPath === p)
    lines.push('  '.repeat(depth) + (isFile ? '📄 ' : '📁 ') + p.split('/').pop())
  }
  return lines.join('\n')
}

function buildCombinedText(files, state, rootName) {
  const bar = '='.repeat(80)
  const lines = []
  lines.push(bar)
  lines.push('📁 PROJECT STRUCTURE (TREE VIEW)')
  lines.push(bar)
  lines.push('')
  lines.push(buildTreeView(files, rootName))
  lines.push('')
  lines.push(bar)
  lines.push('📄 FILE CONTENTS')
  lines.push(bar)
  lines.push(`Generated: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`)
  lines.push(`Root: ${rootName}`)
  lines.push(bar)

  let totalSize = 0
  const seen = new Map()
  const duplicates = []
  for (const f of files) {
    lines.push('')
    lines.push(`--- START FILE: ${f.relPath} ---`)
    if (state.includeStats) {
      const lineCount = f.content.split('\n').length
      const bytes = new Blob([f.content]).size
      lines.push(`# Size: ${bytes} bytes | Lines: ${lineCount} | Modified: (browser — unavailable)`)
      lines.push('')
    } else {
      lines.push('')
    }
    lines.push(f.content)
    lines.push(`--- END FILE: ${f.relPath} ---`)

    const key = f.content.length ? f.content.slice(0, 200) + ':' + f.content.length : ''
    if (key) {
      if (seen.has(key)) duplicates.push({ file: f.relPath, original: seen.get(key) })
      else seen.set(key, f.relPath)
    }
    totalSize += new Blob([f.content]).size
  }

  lines.push('')
  lines.push(bar)
  lines.push('📊 SUMMARY')
  lines.push(bar)
  lines.push(`Total files: ${files.length}`)
  lines.push(`Total size: ${totalSize} bytes`)
  if (duplicates.length) {
    lines.push('')
    lines.push('⚠️ DUPLICATE FILES DETECTED:')
    for (const d of duplicates) lines.push(`  - ${d.file} (duplicate of ${d.original})`)
  }
  lines.push(bar)
  lines.push('')

  return { text: lines.join('\n'), duplicates, totalSize }
}

export default function App() {
  const [theme, setTheme] = useState('dark')
  const [state, setState] = useState(DEFAULT_STATE)
  const [log, setLog] = useState([])
  const [processing, setProcessing] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewContent, setPreviewContent] = useState('')

  useEffect(() => {
    document.body.className = theme
  }, [theme])

  function addLog(msg) {
    setLog(l => [...l, msg])
  }

  async function combineNative() {
    const dirHandle = window.__combinerNativeDirHandle
    const saveHandle = window.__combinerNativeSaveHandle
    if (!dirHandle) {
      addLog('❌ Native folder handle missing — pick the folder again.')
      setLastResult({ success: false, files_processed: 0, output_path: '', log: [] })
      return
    }

    setProcessing(true)
    setLastResult(null)
    addLog('🚀 Starting in-browser combination...')

    try {
      const excludedDirs = state.excludedDirs.split(',').map(s => s.trim()).filter(Boolean)
      const excludedFiles = state.excludedFiles.split(',').map(s => s.trim()).filter(Boolean)
      const includedDirs = state.includedDirs.split(',').map(s => s.trim()).filter(Boolean)
      const includedFiles = state.includedFiles.split(',').map(s => s.trim()).filter(Boolean)
      const maxSize = parseInt(state.maxFileSize) || 0
      const useInclude = includedDirs.length > 0 || includedFiles.length > 0

      // Load .gitignore patterns if the toggle is on. Missing file = no patterns.
      let gitignorePatterns = []
      if (state.useGitignore) {
        try {
          const giHandle = await dirHandle.getFileHandle('.gitignore')
          const giFile = await giHandle.getFile()
          gitignorePatterns = parseGitignore(await giFile.text())
          addLog(`📄 Loaded ${gitignorePatterns.length} .gitignore pattern(s)`)
        } catch {
          addLog('ℹ️ No .gitignore found in project root — toggle has no effect')
        }
      }

      const files = []
      const t0 = Date.now()
      for await (const item of walkDirHandle(dirHandle, {
        excludedDirs,
        excludedFiles,
        maxFileSize: maxSize,
        gitignorePatterns
      })) {
        if (useInclude) {
          const parts = item.relPath.split('/')
          const name = parts[parts.length - 1]
          const dirParts = parts.slice(0, -1)
          if (includedFiles.length > 0) {
            if (!includedFiles.includes(name)) continue
          } else if (includedDirs.length > 0) {
            if (!dirParts.some(p => includedDirs.includes(p))) continue
          }
        }
        files.push(item)
      }
      addLog(`📦 Gathered ${files.length} files in ${Date.now() - t0}ms`)

      if (state.sortFiles) files.sort((a, b) => a.relPath.localeCompare(b.relPath))

      const { text, duplicates, totalSize } = buildCombinedText(files, state, dirHandle.name)

      let savedPath = '(in-browser)'
      if (saveHandle) {
        await writeToHandle(saveHandle, text)
        savedPath = `[Native file] ${saveHandle.name}`
        addLog(`💾 Written via native save → ${saveHandle.name}`)
      } else {
        const blob = new Blob([text], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'combined_project_files.txt'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        savedPath = 'combined_project_files.txt (downloaded)'
        addLog('💾 Downloaded as combined_project_files.txt')
      }

      window.__combinerLastOutput = text
      setLastResult({
        success: true,
        files_processed: files.length,
        total_size: totalSize,
        output_path: savedPath,
        duplicates,
        log: []
      })
      addLog(`✅ Combined ${files.length} files → ${savedPath}`)
    } catch (e) {
      addLog(`❌ Native combine error: ${e.name || ''} ${e.message || e}`)
      setLastResult({ success: false, files_processed: 0, output_path: '', log: [] })
    } finally {
      setProcessing(false)
    }
  }

  async function handleCombine() {
    // Route to native pipeline ONLY if a native handle is actually present
    if (window.__combinerNativeDirHandle) {
      return combineNative()
    }

    setLog([])
    const root = state.rootDir.trim()
    const output = state.outputPath.trim()

    if (!root) {
      addLog('❌ Project Root is empty. Click Browse or type a path.')
      setLastResult({ success: false, files_processed: 0, output_path: '', log: [] })
      return
    }
    if (!output) {
      addLog('❌ Output Path is empty. Set a full path ending in .txt')
      setLastResult({ success: false, files_processed: 0, output_path: '', log: [] })
      return
    }
    const fileName = output.split(/[\\/]/).pop() || ''
    if (!fileName.includes('.')) {
      addLog(`❌ Output Path "${output}" looks like a folder. Append a filename like combined.txt`)
      setLastResult({ success: false, files_processed: 0, output_path: '', log: [] })
      return
    }

    setProcessing(true)
    setLastResult(null)
    addLog('🚀 Starting file combination...')

    try {
      const payload = {
        root_dir: state.rootDir,
        output_path: state.outputPath,
        excluded_dirs: state.excludedDirs.split(',').map(s => s.trim()).filter(Boolean),
        excluded_files: state.excludedFiles.split(',').map(s => s.trim()).filter(Boolean),
        included_dirs: state.includedDirs.split(',').map(s => s.trim()).filter(Boolean),
        included_files: state.includedFiles.split(',').map(s => s.trim()).filter(Boolean),
        max_file_size: parseInt(state.maxFileSize) || null,
        include_stats: state.includeStats,
        sort_files: state.sortFiles,
        use_gitignore: state.useGitignore
      }
      const res = await combineFiles(payload)
      res.log.forEach(addLog)
      setLastResult(res)
      // Cache backend output for copy button
      if (res.success && res.output_path) {
        try {
          const r = await fetch(`/api/preview?path=${encodeURIComponent(res.output_path)}`)
          const data = await r.json()
          if (data.error) {
            addLog(`⚠️ Combine succeeded but output preview failed: ${data.error}`)
          } else {
            window.__combinerLastOutput = data.content || ''
          }
        } catch (e) {
          addLog(`⚠️ Combine succeeded but output preview request failed: ${e.message}`)
        }
      }
    } catch (e) {
      addLog(`❌ Error: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  async function handlePreview() {
    const out = lastResult?.output_path || ''
    if (out.startsWith('[Native file]') || out.includes('(download')) {
      setPreviewContent(window.__combinerLastOutput || '(empty)')
      setPreviewOpen(true)
      return
    }
    try {
      const r = await fetch(`/api/preview?path=${encodeURIComponent(out)}`)
      const data = await r.json()
      if (data.error) {
        addLog(`❌ Preview error: ${data.error}`)
        return
      }
      setPreviewContent(data.content || '(empty)')
      setPreviewOpen(true)
    } catch (e) {
      addLog(`❌ Preview error: ${e.message}`)
    }
  }

  async function handleCopy() {
    // Prefer the cached string, but fall back to fetching the output file
    // on demand so a stale/cleared global doesn't break the button.
    let text = window.__combinerLastOutput

    if (!text) {
      const out = lastResult?.output_path || ''
      const isNative = out.startsWith('[Native file]') || out.includes('(download')
      if (!out) {
        addLog('⚠️ No combined output to copy yet — run COMBINE first.')
        return
      }
      if (isNative) {
        addLog('⚠️ Output is in-browser only — run COMBINE again to regenerate it.')
        return
      }
      try {
        const r = await fetch(`/api/preview?path=${encodeURIComponent(out)}`)
        const data = await r.json()
        if (data.error) {
          addLog(`❌ Copy failed: ${data.error}`)
          return
        }
        text = data.content || ''
        window.__combinerLastOutput = text
      } catch (e) {
        addLog(`❌ Copy failed: could not read output — ${e.message}`)
        return
      }
    }

    if (!text) {
      addLog('⚠️ Output is empty — nothing to copy.')
      return
    }

    try {
      const ok = await copyToClipboard(text)
      addLog(ok ? '📋 Copied to clipboard' : '❌ Clipboard access denied by browser')
    } catch (e) {
      addLog(`❌ Copy error: ${e.message}`)
    }
  }

  return (
    <div className="app">
      <Header theme={theme} onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} />

      {lastResult && (
        <div className={'msg ' + (lastResult.success ? 'ok' : 'err')}>
          {lastResult.success
            ? `✅ Combined ${lastResult.files_processed} files → ${lastResult.output_path}`
            : '❌ Combination failed. Check logs.'}
        </div>
      )}

      <ConfigSection state={state} setState={setState} addLog={addLog} />
      <FiltersSection state={state} setState={setState} />
      <SearchSection state={state} setState={setState} addLog={addLog} />
      <FileTree state={state} addLog={addLog} />

      <button
        className="action-btn combine-btn"
        onClick={handleCombine}
        disabled={processing}
        aria-busy={processing}
      >
        {processing ? (
          <><span className="spinner" /> Processing…</>
        ) : (
          <>⚡ Combine All Selected Files</>
        )}
      </button>

      {lastResult?.success && lastResult.output_path && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="action-btn"
            style={{ flex: 1, background: 'var(--bg2)', color: 'var(--fg)', border: '1px solid var(--border)' }}
            onClick={handlePreview}
          >
            👁️ Preview
          </button>
          <button
            className="action-btn"
            style={{ flex: 1, background: 'var(--bg2)', color: 'var(--fg)', border: '1px solid var(--border)' }}
            onClick={handleCopy}
          >
            📋 Copy to Clipboard
          </button>
        </div>
      )}

      {lastResult?.duplicates?.length > 0 && (
        <div className="msg warn">
          ⚠️ {lastResult.duplicates.length} duplicate files detected
        </div>
      )}

      <LogPanel log={log} />
      <PreviewModal
        open={previewOpen}
        content={previewContent}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  )
}