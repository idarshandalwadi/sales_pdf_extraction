import pdfplumber

with pdfplumber.open("pdf2.PDF") as pdf:
    for i, page in enumerate(pdf.pages):
        width = page.width
        height = page.height
        
        left_bbox = (0, 0, width/2, height)
        right_bbox = (width/2, 0, width, height)
        
        left_page = page.within_bbox(left_bbox)
        right_page = page.within_bbox(right_bbox)
        
        print(f"--- Page {i+1} LEFT ---")
        print(left_page.extract_text())
        print(f"--- Page {i+1} RIGHT ---")
        print(right_page.extract_text())
