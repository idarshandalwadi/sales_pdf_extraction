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

/**
 * Parse text lines into sale/return entries.
 *
 * @param {string[]} textLines   - Lines extracted from one column of one PDF page.
 * @param {object|null} carryIn  - An entry object carried over from the previous page
 *                                 (it may still be expecting products on this page).
 * @returns {{ entries: object[], carryOut: object|null }}
 *   entries  – fully resolved entries (those that had at least a Sale/SRet header)
 *   carryOut – the last open entry that may continue on the next page (or null)
 */
function parseTextToEntries(textLines, carryIn) {
  const entries = [];
  // If a carry-in entry exists, start with it so its products can be collected
  let currentEntry = carryIn || null;

  // e.g. "2809.00 24/12/2025 Sale" or "34716.0025/07/2025 SRet"
  const entryStartRegex = /^(\d+\.?\d*)?\s*(\d{2}\/\d{2}\/\d{4})\s+(Sale|SRet)/;

  // Match full "Qty : X  Rate : Y" or partial "Qty : X  Rate :" (rate value cut off at page break)
  const qtyRegex = /Qty\s*:\s*(\d+(?:\.\d+)?)\s+Rate\s*:\s*(\d+(?:\.\d+)?)?/;

  // Lines to skip entirely — carry-forward summaries, page headers, and column labels
  const skipLineRegex = /B\/F\s*-?>?\s*From\s+Page|C\/F\s*-?>?\s*On\s+Page|^Page\s*:\s*\d|Debit\s+Particulars|Credit\s+Particulars|Account\s+Statement\s+For|Factory\s+Add\.|Silver\s+Sine\s+Bio\s+Tech|^From\s+\d{2}\/\d{2}\/\d{4}\s+To\s+/i;

  // Phrases inside tempProductName that should be filtered out when building product name
  const skipPhrases = ['Sales A/c.', 'Bill No', 'SCB', 'SYN SCB', 'B/F', 'C/F',
    'Debit Particulars', 'Credit Particulars', 'Page :', 'Silver Sine', 'Factory Add'];

  for (const line of textLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip carry-forward/carry-back summary lines
    if (skipLineRegex.test(trimmed)) continue;

    const match = trimmed.match(entryStartRegex);
    if (match) {
      // Before starting a new entry, flush any pending product name for the previous entry
      if (currentEntry) {
        _flushPendingProduct(currentEntry, skipPhrases);
      }

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
        // Rate may be missing if the line was cut off at a page boundary — that's OK
        const rate = qtyMatch[2] !== undefined ? parseFloat(qtyMatch[2]) : null;

        const prodLines = currentEntry.tempProductName.filter(pline => {
          if (skipPhrases.some(sp => pline.includes(sp))) return false;
          // Exclude lines that are entirely uppercase — these are usually note/comment lines
          // e.g. "MONDAY 2 PRODUCT NU BILL BANAYEL CHE", "RATE DIFFERANT CN"
          // A product name always has at least one lowercase letter.
          const lettersOnly = pline.replace(/[^a-zA-Z]/g, '');
          if (lettersOnly.length > 0 && lettersOnly === lettersOnly.toUpperCase()) return false;
          return true;
        });

        const productName = prodLines.join(" ").trim();
        if (productName) {
          currentEntry.products.push({
            name: productName,
            qty,
            rate
          });
        }
        currentEntry.tempProductName = [];
      } else {
        currentEntry.tempProductName.push(trimmed);
      }
    }
  }

  // Return the last open entry as carryOut so the next page can continue filling it
  return { entries, carryOut: currentEntry };
}

/** Flush any accumulated tempProductName that never got a Qty line (end-of-column cleanup). */
function _flushPendingProduct(entry, skipPhrases) {
  // Only flush if there is actually a pending product waiting for a Qty line.
  // If tempProductName is empty we have nothing to do.
  if (!entry.tempProductName || entry.tempProductName.length === 0) return;

  // If the product lines look like noise, just discard them.
  const prodLines = entry.tempProductName.filter(pline => {
    return !skipPhrases.some(sp => pline.includes(sp));
  });
  // Don't add a product without a qty — just clear the buffer.
  entry.tempProductName = [];
}

export async function parsePdfFile(file) {
  const pdfjsLib = await getPdfJsLib();
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const allSales = [];
  const allReturns = [];
  let clientName = null;
  let totalTextItems = 0;

  // Carry-over state across pages — one per column (left = returns, right = sales)
  let leftCarryOut = null;
  let rightCarryOut = null;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.0 });
    const content = await page.getTextContent();
    totalTextItems += content.items.length;
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

    // Parse each column, passing in any carry-over entry from the previous page
    const { entries: leftEntries, carryOut: newLeftCarry } = parseTextToEntries(leftLines, leftCarryOut);
    const { entries: rightEntries, carryOut: newRightCarry } = parseTextToEntries(rightLines, rightCarryOut);

    // Only push newly-started entries (the carry-in entry is already in allSales/allReturns from the previous page)
    const leftNew = leftCarryOut ? leftEntries.filter(e => e !== leftCarryOut) : leftEntries;
    const rightNew = rightCarryOut ? rightEntries.filter(e => e !== rightCarryOut) : rightEntries;

    allReturns.push(...leftNew);
    allSales.push(...rightNew);

    leftCarryOut = newLeftCarry;
    rightCarryOut = newRightCarry;
  }

  if (totalTextItems === 0) {
    throw new Error('This PDF appears to be scanned/image-based (no selectable text).');
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
