export function GlobalHeader({
  showLogout = false,
  onLogout,
  isAdmin = false,
  activeView = 'extractor',
  onChangeView
}) {
  return (
    <header className="global-header">
      <div className="header-content">
        <h1>📚 Invoice Extractor</h1>
        <div className="header-actions-right">
          {isAdmin ? (
            <nav className="top-nav" aria-label="Admin navigation">
              <button
                type="button"
                className={`top-nav-btn ${activeView === 'extractor' ? 'active' : ''}`}
                onClick={() => onChangeView?.('extractor')}
              >
                Extractor
              </button>
              <button
                type="button"
                className={`top-nav-btn ${activeView === 'users' ? 'active' : ''}`}
                onClick={() => onChangeView?.('users')}
              >
                User Management
              </button>
            </nav>
          ) : null}
          {showLogout && onLogout ? (
            <button type="button" className="btn-secondary" onClick={onLogout}>
              Logout 🔒
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
