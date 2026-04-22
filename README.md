
LIVE Preview URL:
https://extractsales.netlify.app/

# Sales Invoice PDF Extractor

A comprehensive tool for extracting sales and sales return data from PDF invoices. This project provides both Python scripts for backend processing and a React-based web interface for easy PDF upload and data extraction.

## Features

- **PDF Text Extraction**: Extracts text content from PDF invoice files
- **Sales Data Parsing**: Identifies and parses sales transactions with dates, amounts, and product details
- **Sales Return Processing**: Handles sales return entries (SRet) alongside regular sales
- **Product Information**: Extracts product names, quantities, and rates from invoice lines
- **Financial Year Calculation**: Automatically determines the financial year for each transaction
- **Web Interface**: User-friendly React application with login system
- **Dual Implementation**: Both Python backend scripts and JavaScript frontend parsing

## Project Structure

```
pdf_extraction/
├── README.md
├── pdf-ui/                    # React web application
│   ├── src/
│   │   ├── lib/
│   │   │   └── pdfParser.js   # JavaScript PDF parsing logic
│   │   ├── App.jsx            # Main React component
│   │   ├── users.json         # User authentication data
│   │   └── ...
│   ├── package.json
│   └── vite.config.js
└── python_scripts/            # Python backend scripts
    ├── parse_logic.py         # Main parsing logic
    ├── read_pdf.py            # Basic PDF text extraction
    └── read_pdf_split.py      # Advanced PDF processing
```

## Technologies Used

### Frontend (pdf-ui)
- **React 19**: Modern JavaScript library for building user interfaces
- **Vite**: Fast build tool and development server
- **PDF.js**: JavaScript library for PDF parsing and rendering
- **jsPDF & html2pdf.js**: PDF generation and manipulation
- **html2canvas**: HTML to canvas conversion

### Backend (python_scripts)
- **Python**: Core programming language
- **pdfplumber**: PDF text extraction library
- **re (regex)**: Regular expression pattern matching
- **datetime**: Date parsing and manipulation

## Installation & Setup

### Prerequisites
- Node.js (for the React frontend)
- Python 3.x (for backend scripts)
- npm or yarn package manager

### Frontend Setup
```bash
cd pdf-ui
npm install
npm run dev
```

### Backend Setup
```bash
cd python_scripts
pip install pdfplumber
python parse_logic.py  # Run the parsing logic
```

## Usage

### Web Interface
1. Start the development server: `npm run dev` in the `pdf-ui` directory
2. Open your browser to the provided URL
3. Log in using the credentials from `users.json`
4. Upload a PDF invoice file
5. View the extracted sales and sales return data

### Python Scripts
- `read_pdf.py`: Basic PDF text extraction from a file named "pdf2.PDF"
- `parse_logic.py`: Advanced parsing logic for sales/return entries
- `read_pdf_split.py`: Additional PDF processing utilities

## Data Format

The extractor parses PDF content into structured entries:

```javascript
{
  dateStr: "20/11/2025",
  type: "Sale", // or "SRet" for sales returns
  products: [
    {
      name: "Force-10 1KG",
      qty: 25.000,
      rate: 81.00
    }
  ],
  financialYear: "01/04/2025 to 31/03/2026"
}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Author

- **Darshan Dalwadi**

## License

This project is private and proprietary.

- **PDF Text Extraction**: Extracts text content from PDF invoice files
- **Sales Data Parsing**: Identifies and parses sales transactions with dates, amounts, and product details
- **Sales Return Processing**: Handles sales return entries (SRet) alongside regular sales
- **Product Information**: Extracts product names, quantities, and rates from invoice lines
- **Financial Year Calculation**: Automatically determines the financial year for each transaction
- **Web Interface**: User-friendly React application with login system
- **Dual Implementation**: Both Python backend scripts and JavaScript frontend parsing

## Project Structure

```
pdf_extraction/
├── README.md
├── pdf-ui/                    # React web application
│   ├── src/
│   │   ├── lib/
│   │   │   └── pdfParser.js   # JavaScript PDF parsing logic
│   │   ├── App.jsx            # Main React component
│   │   ├── users.json         # User authentication data
│   │   └── ...
│   ├── package.json
│   └── vite.config.js
└── python_scripts/            # Python backend scripts
    ├── parse_logic.py         # Main parsing logic
    ├── read_pdf.py            # Basic PDF text extraction
    └── read_pdf_split.py      # Advanced PDF processing
```

## Technologies Used

### Frontend (pdf-ui)
- **React 19**: Modern JavaScript library for building user interfaces
- **Vite**: Fast build tool and development server
- **PDF.js**: JavaScript library for PDF parsing and rendering
- **jsPDF & html2pdf.js**: PDF generation and manipulation
- **html2canvas**: HTML to canvas conversion

### Backend (python_scripts)
- **Python**: Core programming language
- **pdfplumber**: PDF text extraction library
- **re (regex)**: Regular expression pattern matching
- **datetime**: Date parsing and manipulation

## Installation & Setup

### Prerequisites
- Node.js (for the React frontend)
- Python 3.x (for backend scripts)
- npm or yarn package manager

### Frontend Setup
```bash
cd pdf-ui
npm install
npm run dev
```

### Backend Setup
```bash
cd python_scripts
pip install pdfplumber
python parse_logic.py  # Run the parsing logic
```

## Usage

### Web Interface
1. Start the development server: `npm run dev` in the `pdf-ui` directory
2. Open your browser to the provided URL
3. Log in using the credentials from `users.json`
4. Upload a PDF invoice file
5. View the extracted sales and sales return data

### Python Scripts
- `read_pdf.py`: Basic PDF text extraction from a file named "pdf2.PDF"
- `parse_logic.py`: Advanced parsing logic for sales/return entries
- `read_pdf_split.py`: Additional PDF processing utilities

## Data Format

The extractor parses PDF content into structured entries:

```javascript
{
  dateStr: "20/11/2025",
  type: "Sale", // or "SRet" for sales returns
  products: [
    {
      name: "Force-10 1KG",
      qty: 25.000,
      rate: 81.00
    }
  ],
  financialYear: "01/04/2025 to 31/03/2026"
}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Author

- **Darshan Dalwadi**

## License

This project is private and proprietary.
