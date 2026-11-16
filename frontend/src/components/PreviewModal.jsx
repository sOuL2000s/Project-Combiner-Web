export default function PreviewModal({ open, content, onClose }) {
  if (!open) return null
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <header>
          <h3>Combined Output Preview</h3>
          <button onClick={onClose}>×</button>
        </header>
        <div className="body">
          <pre style={{ whiteSpace: 'pre-wrap' }}>{content}</pre>
        </div>
      </div>
    </div>
  )
}