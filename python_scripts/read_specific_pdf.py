import pdfplumber
import sys

file_path = "Sample PDFs/ShriButBhavaniFertilizer-Viramgam_SetupBased_01-04-25_31-03-26-2.PDF"

print(f"Reading {file_path}...")
try:
    with pdfplumber.open(file_path) as pdf:
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
            if i >= 1: # just read first two pages
                break
except Exception as e:
    print(f"Error reading PDF: {e}")
