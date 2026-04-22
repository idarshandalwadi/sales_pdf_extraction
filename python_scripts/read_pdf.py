import pdfplumber

with pdfplumber.open("pdf2.PDF") as pdf:
    for i, page in enumerate(pdf.pages):
        text = page.extract_text()
        print(f"--- Page {i+1} ---")
        print(text)
