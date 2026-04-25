let pdfJsLibPromise = null;

async function getPdfJsLib() {
  if (!pdfJsLibPromise) {
    pdfJsLibPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`;
      return pdfjsLib;
    });
  }
  return pdfJsLibPromise;
}

function getFinancialYear(dateStr) {
  // dateStr format: DD/MM/YYYY
  const parts = dateStr.split('/');
  if (parts.length !== 3) return "Unknown Year";
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);

  if (month >= 4) {
    return `01/04/${year} to 31/03/${year + 1}`;
  } else {
    return `01/04/${year - 1} to 31/03/${year}`;
  }
}

function parseTextToEntries(textLines, isSale) {
  const entries = [];
  let currentEntry = null;

  // e.g., "2809.00 24/12/2025 Sale" or "34716.0025/07/2025 SRet"
  const entryStartRegex = /^(\d+\.\d{2})\s*(\d{2}\/\d{2}\/\d{4})\s+(Sale|SRet)/;
  const qtyRegex = /Qty\s*:\s*(\d+(?:\.\d+)?)\s+Rate\s*:\s*(\d+(?:\.\d+)?)/;

  for (const line of textLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(entryStartRegex);
    if (match) {
      const amount = parseFloat(match[1]);
      const dateStr = match[2];
      const typeStr = match[3];

      currentEntry = {
        dateStr,
        type: typeStr,
        products: [],
        tempProductName: [],
        financialYear: getFinancialYear(dateStr)
      };
      entries.push(currentEntry);
    } else if (currentEntry) {
      const qtyMatch = trimmed.match(qtyRegex);
      if (qtyMatch) {
        const qty = parseFloat(qtyMatch[1]);
        const rate = parseFloat(qtyMatch[2]);

        const skipPhrases = ['Sales A/c.', 'Bill No', 'SCB'];
        const prodLines = currentEntry.tempProductName.filter(pline => {
          return !skipPhrases.some(sp => pline.includes(sp));
        });

        const productName = prodLines.join(" ").trim();
        if (productName) {
          currentEntry.products.push({
            name: productName,
            qty
          });
        }
        currentEntry.tempProductName = [];
      } else {
        currentEntry.tempProductName.push(trimmed);
      }
    }
  }

  return entries;
}

export async function parsePdfFile(file) {
  const pdfjsLib = await getPdfJsLib();
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const allSales = [];
  const allReturns = [];
  let clientName = null;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.0 });
    const content = await page.getTextContent();
    const halfWidth = viewport.width / 2;

    const leftItems = [];
    const rightItems = [];

    content.items.forEach(item => {
      // transform[4] is the x-coordinate, transform[5] is the y-coordinate
      const x = item.transform[4];
      const y = item.transform[5];
      
      const parsedItem = { str: item.str, x, y };
      if (x < halfWidth) {
        leftItems.push(parsedItem);
      } else {
        rightItems.push(parsedItem);
      }
    });

    // Group items by Y coordinate to form lines
    const groupItemsToLines = (items) => {
      // Sort items top-to-bottom (Y descending in PDF coordinate space)
      items.sort((a, b) => b.y - a.y);
      
      const lines = [];
      let currentLineY = null;
      let currentLineItems = [];

      items.forEach(item => {
        if (currentLineY === null) {
          currentLineY = item.y;
          currentLineItems.push(item);
        } else {
          // If within 5 points, consider it the same line
          if (Math.abs(item.y - currentLineY) < 5) {
            currentLineItems.push(item);
          } else {
            // Sort items in the line left-to-right
            currentLineItems.sort((a, b) => a.x - b.x);
            lines.push(currentLineItems.map(i => i.str).join(" "));
            
            currentLineY = item.y;
            currentLineItems = [item];
          }
        }
      });
      if (currentLineItems.length > 0) {
        currentLineItems.sort((a, b) => a.x - b.x);
        lines.push(currentLineItems.map(i => i.str).join(" "));
      }
      return lines;
    };

    const leftLines = groupItemsToLines(leftItems);
    const rightLines = groupItemsToLines(rightItems);

    if (!clientName) {
      for (const line of leftLines) {
        const match = line.match(/Account Statement For\s+(.*)/i);
        if (match) {
          clientName = match[1].trim();
          break;
        }
      }
    }

    const leftEntries = parseTextToEntries(leftLines, false);
    const rightEntries = parseTextToEntries(rightLines, true);

    allReturns.push(...leftEntries);
    allSales.push(...rightEntries);
  }

  return {
    clientName: clientName || "Unknown Client",
    yearsData: aggregateData(allSales, allReturns)
  };
}

function aggregateData(sales, returns) {
  const financialYears = {};

  const addData = (entries, isSale) => {
    entries.forEach(entry => {
      const fy = entry.financialYear;
      if (!financialYears[fy]) {
        financialYears[fy] = {
          year: fy,
          products: {}
        };
      }

      entry.products.forEach(prod => {
        const pName = prod.name;
        if (!financialYears[fy].products[pName]) {
          financialYears[fy].products[pName] = { name: pName, sellQty: 0, returnQty: 0 };
        }
        if (isSale) {
          financialYears[fy].products[pName].sellQty += prod.qty;
        } else {
          financialYears[fy].products[pName].returnQty += prod.qty;
        }
      });
    });
  };

  addData(sales, true);
  addData(returns, false);

  // Convert to array
  return Object.values(financialYears).map(fyData => {
    return {
      year: fyData.year,
      products: Object.values(fyData.products)
    };
  });
}
