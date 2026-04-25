import { useState, useCallback } from 'react'
import { parsePdfFile } from './lib/pdfParser'
import { GlobalHeader } from './components/GlobalHeader'
import { GlobalFooter } from './components/GlobalFooter'
import './index.css'

const AUTH_USER_KEY = 'authenticatedUser';

async function loginUser(username, password) {
  const response = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return payload.user;
}

async function getUsageForUser(username) {
  const response = await fetch(`/api/users/${encodeURIComponent(username)}/usage`);
  if (!response.ok) {
    throw new Error('Failed to load usage');
  }

  return response.json();
}

async function incrementUsageForUser(username) {
  const response = await fetch(`/api/users/${encodeURIComponent(username)}/increment-usage`, {
    method: 'POST'
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || 'Usage limit reached');
  }

  return response.json();
}

function getAuthHeaders(currentUser) {
  return {
    'Content-Type': 'application/json',
    'x-auth-username': currentUser?.username || '',
    'x-auth-role': currentUser?.role || ''
  };
}

async function getAdminUsers(currentUser) {
  const response = await fetch('/api/admin/users', {
    headers: getAuthHeaders(currentUser)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to load users');
  }

  return payload.users || [];
}

async function updateAdminUser(currentUser, username, updates) {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(username)}`, {
    method: 'PUT',
    headers: getAuthHeaders(currentUser),
    body: JSON.stringify(updates)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to update user');
  }

  return payload.user;
}

function AdminPanel({
  users,
  loading,
  error,
  message,
  onFieldChange,
  onSave
}) {
  return (
    <section className="admin-panel">
      <div className="admin-panel-header">
        <h2>User Management</h2>
      </div>
      <p>Update `current_count`, `paid`, `paid_date`, and `pdf_limit` for each user.</p>
      {error ? <div className="error-message">{error}</div> : null}
      {message ? <div className="admin-success-message">{message}</div> : null}
      {loading ? (
        <div className="no-data">Loading users...</div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Current Count</th>
                <th>PDF Limit</th>
                <th>Paid</th>
                <th>Paid Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, index) => (
                <tr key={user.username}>
                  <td>{user.username}</td>
                  <td>{user.role}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      value={user.current_count}
                      onChange={(e) => onFieldChange(index, 'current_count', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      value={user.pdf_limit}
                      onChange={(e) => onFieldChange(index, 'pdf_limit', e.target.value)}
                    />
                  </td>
                  <td>
                    <label className="admin-checkbox-wrap">
                      <input
                        type="checkbox"
                        checked={Boolean(user.paid)}
                        onChange={(e) => onFieldChange(index, 'paid', e.target.checked)}
                      />
                      <span>{user.paid ? 'Yes' : 'No'}</span>
                    </label>
                  </td>
                  <td>
                    <input
                      type="date"
                      value={user.paid_date || ''}
                      disabled={!user.paid}
                      onChange={(e) => onFieldChange(index, 'paid_date', e.target.value)}
                    />
                  </td>
                  <td>
                    <button type="button" className="btn-primary" onClick={() => onSave(index)}>
                      Save
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const user = await loginUser(username, password);
      if (user) {
        onLogin(user);
      } else {
        setError('Invalid username or password');
      }
    } catch {
      setError('Unable to login right now. Please try again.');
    }
  };

  return (
    <div className="app-wrapper">
      <GlobalHeader />
      <main className="login-page-main">
        <div className="login-container">
          <div className="login-card">
            <div className="login-header">
              <h2>Welcome Back</h2>
              <p>Sign in to access the invoice extractor</p>
            </div>
            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  required
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                />
              </div>
              {error && <div className="login-error">{error}</div>}
              <button type="submit" className="btn-primary login-btn">Sign In</button>
            </form>
          </div>
        </div>
      </main>
      <GlobalFooter />
    </div>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('isAuthenticated') === 'true' && !!localStorage.getItem(AUTH_USER_KEY);
  });
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const stored = localStorage.getItem(AUTH_USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [activeView, setActiveView] = useState('extractor');
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [adminMessage, setAdminMessage] = useState('');
  const [usedPdfCount, setUsedPdfCount] = useState(() => {
    try {
      const stored = localStorage.getItem(AUTH_USER_KEY);
      if (!stored) return 0;
      const user = JSON.parse(stored);
      return Number(user?.current_count ?? 0);
    } catch {
      return 0;
    }
  });

  const userLimit = Number(currentUser?.pdf_limit ?? 0);
  const remainingCount = Math.max(userLimit - usedPdfCount, 0);
  const hasReachedLimit = userLimit >= 0 && usedPdfCount >= userLimit;
  const isAdmin = currentUser?.role === 'admin';

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFile = async (file) => {
    if (!file || file.type !== 'application/pdf') {
      setError("Please upload a valid PDF file.");
      return;
    }

    if (!currentUser) {
      setError("Please sign in again to continue.");
      return;
    }

    if (hasReachedLimit) {
      setError(`Upload limit reached. You have used ${usedPdfCount}/${userLimit} PDFs.`);
      return;
    }
    
    setError(null);
    setIsParsing(true);
    
    try {
      // Re-check usage from server to prevent stale client state.
      const currentUsage = await getUsageForUser(currentUser.username);
      if (currentUsage.hasReachedLimit) {
        setUsedPdfCount(currentUsage.current_count);
        setError(`Upload limit reached. You have used ${currentUsage.current_count}/${currentUsage.pdf_limit} PDFs.`);
        return;
      }

      const result = await parsePdfFile(file);
      const updatedUsage = await incrementUsageForUser(currentUser.username);
      setUsedPdfCount(updatedUsage.current_count);
      setCurrentUser((prev) => {
        if (!prev) return prev;
        const nextUser = { ...prev, current_count: updatedUsage.current_count };
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(nextUser));
        return nextUser;
      });
      setData(result);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to parse PDF. Ensure it is a valid sales statement.");
    } finally {
      setIsParsing(false);
    }
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const onFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  const handleExportPDF = async () => {
  const element = document.getElementById('pdf-export-content');
  if (!element) return alert("Content not found");

  const containers = element.querySelectorAll('.products-table-container');
  containers.forEach(c => c.style.overflowX = 'visible');

  try {
    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");

    const canvas = await html2canvas(element, { 
      scale: 1.5,
      useCORS: true,
      backgroundColor: null
    });

    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    let heightLeft = pdfHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;
    }

    let rawName = data?.clientName || 'Export';
    let safeName = rawName.replace(/[\r\n\x00-\x1F\x7F<>:"/\\|?*]/g, '').trim();
    if (!safeName) safeName = 'Export';

    pdf.save(`${safeName}_Report.pdf`);
  } catch (err) {
    console.error("PDF Export error:", err);
    alert("Failed to export PDF.");
  } finally {
    containers.forEach(c => c.style.overflowX = 'auto');
  }
};

  // const handleExportPDF = async () => {
  //   const element = document.getElementById('pdf-export-content');
    
  //   // Temporarily disable overflow so html2canvas doesn't truncate the table
  //   const containers = element.querySelectorAll('.products-table-container');
  //   containers.forEach(c => c.style.overflowX = 'visible');

  //   try {
  //     const canvas = await html2canvas(element, { 
  //       scale: 2, 
  //       useCORS: true, 
  //       backgroundColor: '#0f172a' 
  //     });
      
  //     const imgData = canvas.toDataURL('image/png');
      
  //     const pdf = new jsPDF({
  //       orientation: 'portrait',
  //       unit: 'mm',
  //       format: 'a4'
  //     });
      
  //     const pdfWidth = pdf.internal.pageSize.getWidth();
  //     const pageHeight = pdf.internal.pageSize.getHeight();
  //     const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
  //     let heightLeft = pdfHeight;
  //     let position = 0;
      
  //     // Add first page
  //     pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
  //     heightLeft -= pageHeight;
      
  //     // Add subsequent pages if content overflows
  //     while (heightLeft > 0) {
  //       position = position - pageHeight;
  //       pdf.addPage();
  //       pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
  //       heightLeft -= pageHeight;
  //     }
      
  //     let rawName = data?.clientName || 'Export';
  //     // Strip control characters (newlines) and illegal path characters, but keep spaces/parentheses
  //     let safeName = rawName.replace(/[\r\n\x00-\x1F\x7F<>:"/\\|?*]/g, '').trim();
  //     if (!safeName) safeName = 'Export';
      
  //     pdf.save(`${safeName}_Report.pdf`);
  //   } catch (err) {
  //     console.error("PDF Export error:", err);
  //     alert("Failed to export PDF. Please try again.");
  //   } finally {
  //     // Restore overflow after saving
  //     containers.forEach(c => c.style.overflowX = 'auto');
  //   }
  // };

  const handleLogin = (user) => {
    const safeUser = {
      username: user.username,
      role: user.role,
      pdf_limit: Number(user.pdf_limit ?? 0),
      paid: Boolean(user.paid),
      paid_date: user.paid_date,
      current_count: Number(user.current_count ?? 0)
    };
    localStorage.setItem('isAuthenticated', 'true');
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(safeUser));
    setCurrentUser(safeUser);
    setUsedPdfCount(safeUser.current_count);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem(AUTH_USER_KEY);
    setIsAuthenticated(false);
    setCurrentUser(null);
    setUsedPdfCount(0);
    setData(null);
    setActiveView('extractor');
    setAdminUsers([]);
    setAdminError('');
    setAdminMessage('');
  };

  const loadAdminUsers = async () => {
    if (!isAdmin || !currentUser) return;
    setAdminLoading(true);
    setAdminError('');
    setAdminMessage('');
    try {
      const users = await getAdminUsers(currentUser);
      setAdminUsers(users);
    } catch (err) {
      setAdminError(err?.message || 'Unable to load users.');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleViewChange = async (view) => {
    if (!isAdmin) return;
    setActiveView(view);
    if (view === 'users') {
      await loadAdminUsers();
    }
  };

  const handleAdminFieldChange = (index, field, value) => {
    setAdminUsers((prev) => prev.map((user, i) => {
      if (i !== index) return user;
      if (field === 'paid') {
        return {
          ...user,
          paid: value,
          paid_date: value ? user.paid_date : null
        };
      }
      return { ...user, [field]: value };
    }));
  };

  const handleSaveAdminUser = async (index) => {
    const targetUser = adminUsers[index];
    if (!targetUser || !currentUser) return;

    setAdminError('');
    setAdminMessage('');

    const updates = {
      current_count: Number(targetUser.current_count || 0),
      pdf_limit: Number(targetUser.pdf_limit || 0),
      paid: Boolean(targetUser.paid),
      paid_date: targetUser.paid ? (targetUser.paid_date || null) : null
    };

    try {
      const updatedUser = await updateAdminUser(currentUser, targetUser.username, updates);
      setAdminUsers((prev) => prev.map((user, i) => i === index ? updatedUser : user));
      setAdminMessage(`Updated user "${updatedUser.username}" successfully.`);

      if (currentUser.username === updatedUser.username) {
        setCurrentUser((prev) => {
          if (!prev) return prev;
          const nextUser = { ...prev, ...updatedUser };
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(nextUser));
          return nextUser;
        });
        setUsedPdfCount(Number(updatedUser.current_count ?? 0));
      }
    } catch (err) {
      setAdminError(err?.message || 'Failed to update user.');
    }
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <div className="app-wrapper">
      <GlobalHeader
        showLogout
        onLogout={handleLogout}
        isAdmin={isAdmin}
        activeView={activeView}
        onChangeView={handleViewChange}
      />

      <div className="app-container">
        <header className="header">
          <h1>Sales Invoice Extractor</h1>
          <p>Extract sales and return quantities grouped by financial year. (April to March)</p>
          <p>
            User: {currentUser?.username || 'Unknown'} | Used: {usedPdfCount}/{userLimit} | Remaining: {remainingCount}
          </p>
        </header>

      {isAdmin && activeView === 'users' ? (
        <AdminPanel
          users={adminUsers}
          loading={adminLoading}
          error={adminError}
          message={adminMessage}
          onFieldChange={handleAdminFieldChange}
          onSave={handleSaveAdminUser}
        />
      ) : null}

      {activeView === 'extractor' && !data && (
        <main className="main-content">
          <div 
            className={`dropzone ${isDragging ? 'dragging' : ''} ${isParsing ? 'parsing' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {isParsing ? (
              <div className="loader-container">
                <div className="spinner"></div>
                <p>Analyzing PDF Document...</p>
              </div>
            ) : (
              <>
                <div className="upload-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                </div>
                <h2>Drag & Drop your PDF here</h2>
                <p>or click to browse from your computer</p>
                <input 
                  type="file" 
                  accept="application/pdf" 
                  onChange={onFileChange} 
                  id="file-upload"
                  className="file-input"
                />
                <label htmlFor="file-upload" className="btn-primary">Browse Files</label>
              </>
            )}
          </div>
          {error && <div className="error-message">{error}</div>}
        </main>
      )}

      {activeView === 'extractor' && data && (
        <div className="results-container">
          <div className="results-header">
            <h2 style={{marginRight: '2rem'}}>Extraction Results</h2>
            <div className="header-actions">
              <button className="btn-primary" onClick={handleExportPDF} style={{marginRight: '1rem'}}>
                Export to PDF
              </button>
              <button className="btn-secondary" onClick={() => setData(null)}>Upload Another File</button>
            </div>
          </div>
          
          {data.yearsData.length === 0 ? (
            <div className="no-data">No valid sales or returns found in this document.</div>
          ) : (
            <div className="years-list" id="pdf-export-content">
              <div className="client-header">
                <h3>Client: <span className="client-name-highlight">{data.clientName}</span></h3>
              </div>
              {data.yearsData.map((fyData, i) => {
                const totalSell = fyData.products.reduce((acc, p) => acc + (p.sellQty || 0), 0);
                const totalReturn = fyData.products.reduce((acc, p) => acc + (p.returnQty || 0), 0);
                const totalNet = totalSell - totalReturn;
                
                return (
                <div key={i} className="year-card">
                  <div className="year-header">
                    <h3>Year: {fyData.year}</h3>
                  </div>
                  <div className="products-table-container">
                    <table className="products-table">
                      <thead>
                        <tr>
                          <th>Product Name</th>
                          <th className="qty-col">Sell Qty</th>
                          <th className="qty-col">Sell Return Qty</th>
                          <th className="qty-col">Net Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fyData.products.map((prod, j) => {
                          const netQty = (prod.sellQty || 0) - (prod.returnQty || 0);
                          return (
                          <tr key={j}>
                            <td>{prod.name}</td>
                            <td className="qty-col sell">{prod.sellQty > 0 ? prod.sellQty : '-'}</td>
                            <td className="qty-col return">{prod.returnQty > 0 ? prod.returnQty : '-'}</td>
                            <td className={`qty-col net ${netQty > 0 ? 'positive' : netQty < 0 ? 'negative' : ''}`}>
                              {netQty !== 0 ? netQty : '-'}
                            </td>
                          </tr>
                        )})}
                      </tbody>
                      <tfoot>
                        <tr className="totals-row">
                          <td>Total</td>
                          <td className="qty-col sell">{totalSell > 0 ? totalSell : '-'}</td>
                          <td className="qty-col return">{totalReturn > 0 ? totalReturn : '-'}</td>
                          <td className={`qty-col net ${totalNet > 0 ? 'positive' : totalNet < 0 ? 'negative' : ''}`}>
                            {totalNet !== 0 ? totalNet : '-'}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>
      )}
      </div>

      <GlobalFooter />
    </div>
  )
}

export default App
