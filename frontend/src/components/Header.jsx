export default function Header({ theme, onToggleTheme }) {
  return (
    <header className="top">
      <h1>📁 Project File Combiner Pro</h1>
      <button onClick={onToggleTheme}>
        {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
      </button>
    </header>
  )
}