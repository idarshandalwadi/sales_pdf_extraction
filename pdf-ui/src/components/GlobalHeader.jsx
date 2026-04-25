export function GlobalHeader({
  showLogout = false,
  onLogout,
  isAdmin = false,
  activeView = 'extractor',
  onChangeView
}) {
  return (
    <header className="global-header shadow-sm">
      <div className="header-content container-fluid d-flex align-items-center justify-content-between gap-3 py-2">
        <h1 className="h4 mb-0">📚 Invoice Extractor</h1>
        <div className="header-actions-right d-flex align-items-center gap-2">
          {isAdmin ? (
            <>
            <nav className="top-nav d-none d-md-flex flex-wrap gap-2" aria-label="Admin navigation">
              <button
                type="button"
                className={`top-nav-btn btn btn-sm ${activeView === 'extractor' ? 'active btn-primary' : 'btn-outline-primary'}`}
                onClick={() => onChangeView?.('extractor')}
              >
                Extractor
              </button>
              <button
                type="button"
                className={`top-nav-btn btn btn-sm ${activeView === 'add-user' ? 'active btn-primary' : 'btn-outline-primary'}`}
                onClick={() => onChangeView?.('add-user')}
              >
                Add User
              </button>
              <button
                type="button"
                className={`top-nav-btn btn btn-sm ${activeView === 'manage-users' ? 'active btn-primary' : 'btn-outline-primary'}`}
                onClick={() => onChangeView?.('manage-users')}
              >
                Manage Users
              </button>
            </nav>
            <button
              type="button"
              className="btn btn-outline-primary btn-sm d-md-none mobile-menu-btn"
              data-bs-toggle="offcanvas"
              data-bs-target="#adminMobileSidebar"
              aria-controls="adminMobileSidebar"
            >
              Menu
            </button>
            </>
          ) : null}
          {showLogout && onLogout ? (
            <button
              type="button"
              className={`btn btn-outline-primary p-2 btn-sm ${isAdmin ? 'd-none d-md-inline-flex' : ''}`}
              onClick={onLogout}
            >
              Logout 🔒
            </button>
          ) : null}
        </div>
      </div>

      {isAdmin ? (
        <div
          className="offcanvas offcanvas-start admin-mobile-sidebar text-bg-dark d-md-none"
          tabIndex="-1"
          id="adminMobileSidebar"
          aria-labelledby="adminMobileSidebarLabel"
        >
          <div className="offcanvas-header border-bottom border-secondary-subtle">
            <h5 className="offcanvas-title" id="adminMobileSidebarLabel">Admin Menu</h5>
            <button type="button" className="btn-close btn-close-white" data-bs-dismiss="offcanvas" aria-label="Close" />
          </div>
          <div className="offcanvas-body d-grid gap-2">
            <button
              type="button"
              className={`btn ${activeView === 'extractor' ? 'btn-primary' : 'btn-outline-primary'}`}
              data-bs-dismiss="offcanvas"
              onClick={() => onChangeView?.('extractor')}
            >
              Extractor
            </button>
            <button
              type="button"
              className={`btn ${activeView === 'add-user' ? 'btn-primary' : 'btn-outline-primary'}`}
              data-bs-dismiss="offcanvas"
              onClick={() => onChangeView?.('add-user')}
            >
              Add User
            </button>
            <button
              type="button"
              className={`btn ${activeView === 'manage-users' ? 'btn-primary' : 'btn-outline-primary'}`}
              data-bs-dismiss="offcanvas"
              onClick={() => onChangeView?.('manage-users')}
            >
              Manage Users
            </button>
            {showLogout && onLogout ? (
              <>
                <hr className="my-3 border-secondary-subtle" />
                <button
                  type="button"
                  className="btn btn-outline-light"
                  data-bs-dismiss="offcanvas"
                  onClick={onLogout}
                >
                  Logout 🔒
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}
