import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

function getFinancialYear(dateStr) {
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

  return Object.values(financialYears).map(fyData => {
    return {
      year: fyData.year,
      products: Object.values(fyData.products)
    };
  });
}

const pdfPaths = [
  '../Sample PDFs/KhodiyarAgroCenter-Bhrugupur_SetupBased_01-04-25_31-03-26.PDF',
  '../Sample PDFs/MarutiAgroCenter-Sara_SetupBased_01-04-25_31-03-26.PDF',
  '../Sample PDFs/ShaktiAgro&Fertilizer-Chotila_SetupBased_01-04-25_31-03-26.PDF',
  '../Sample PDFs/ShriButBhavaniFertilizer-Viramgam_SetupBased_01-04-25_31-03-26-2.PDF'
];

async function main() {
  for (const pdfPath of pdfPaths) {
    try {
      const data = new Uint8Array(fs.readFileSync(pdfPath));
      const loadingTask = pdfjsLib.getDocument({ data });
      const pdf = await loadingTask.promise;
      
      let allSales = [];
      let allReturns = [];
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.0 });
        const content = await page.getTextContent();
        const halfWidth = viewport.width / 2;

        const leftItems = [];
        const rightItems = [];

        content.items.forEach(item => {
          const x = item.transform[4];
          const y = item.transform[5];
          if (x < halfWidth) leftItems.push({ str: item.str, x, y });
          else rightItems.push({ str: item.str, x, y });
        });
        
        const groupItemsToLines = (items) => {
          items.sort((a, b) => b.y - a.y);
          const lines = [];
          let currentLineY = null;
          let currentLineItems = [];

          items.forEach(item => {
            if (currentLineY === null) {
              currentLineY = item.y;
              currentLineItems.push(item);
            } else {
              if (Math.abs(item.y - currentLineY) < 5) {
                currentLineItems.push(item);
              } else {
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

        const leftEntries = parseTextToEntries(leftLines, false);
        const rightEntries = parseTextToEntries(rightLines, true);
        
        allReturns.push(...leftEntries);
        allSales.push(...rightEntries);
      }
      
      const yearsData = aggregateData(allSales, allReturns);
      console.log(`${pdfPath.split('/').pop()}: Sales: ${allSales.length}, Returns: ${allReturns.length}, Products: ${yearsData[0]?.products.length || 0}`);
      
    } catch (err) {
      console.error(`Error processing ${pdfPath}:`, err);
    }
  }
}

main();
