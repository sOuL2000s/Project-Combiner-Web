export default function LogPanel({ log }) {
  return (
    <div className="card">
      <h2>Execution Log</h2>
      <div className="log">
        {log.length === 0 ? 'Waiting for actions...' : log.join('\n')}
      </div>
    </div>
  )
}