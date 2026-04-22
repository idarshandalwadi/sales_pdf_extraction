import { useState, useCallback } from 'react'
import { parsePdfFile } from './lib/pdfParser'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import usersData from './users.json'
import './index.css'

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const user = usersData.users.find(u => u.username === username && u.password === password);
    if (user) {
      onLogin();
    } else {
      setError('Invalid username or password');
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h2>Welcome Back</h2>
          <p>Sign in to access the extractor</p>
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
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('isAuthenticated') === 'true';
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

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
    
    setError(null);
    setIsParsing(true);
    
    try {
      const result = await parsePdfFile(file);
      setData(result);
    } catch (err) {
      console.error(err);
      setError("Failed to parse PDF. Ensure it is a valid sales statement.");
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
    
    // Temporarily disable overflow so html2canvas doesn't truncate the table
    const containers = element.querySelectorAll('.products-table-container');
    containers.forEach(c => c.style.overflowX = 'visible');

    try {
      const canvas = await html2canvas(element, { 
        scale: 2, 
        useCORS: true, 
        backgroundColor: '#0f172a' 
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
      
      // Add first page
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;
      
      // Add subsequent pages if content overflows
      while (heightLeft > 0) {
        position = position - pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
      }
      
      let rawName = data?.clientName || 'Export';
      // Strip control characters (newlines) and illegal path characters, but keep spaces/parentheses
      let safeName = rawName.replace(/[\r\n\x00-\x1F\x7F<>:"/\\|?*]/g, '').trim();
      if (!safeName) safeName = 'Export';
      
      pdf.save(`${safeName}_Report.pdf`);
    } catch (err) {
      console.error("PDF Export error:", err);
      alert("Failed to export PDF. Please try again.");
    } finally {
      // Restore overflow after saving
      containers.forEach(c => c.style.overflowX = 'auto');
    }
  };

  const handleLogin = () => {
    localStorage.setItem('isAuthenticated', 'true');
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <div className="app-wrapper">
      <header className="global-header">
        <div className="header-content">
          <h1>Sales Statement Extractor</h1>
          <button className="btn-secondary" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <div className="app-container">
        <header className="header">
          <h1>Sales Statement Extractor</h1>
          <p>Extract sales and return quantities grouped by financial year.</p>
        </header>

      {!data && (
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

      {data && (
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

      <footer className="global-footer">
        <p>All rights reserved by 👉 Darshan Dalwadi 🤓.</p>
      </footer>
    </div>
  )
}

export default App
