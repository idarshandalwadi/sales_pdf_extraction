import re
from collections import defaultdict
from datetime import datetime

# Sample data mimicking the output of the pdf
def parse_text(text, is_sale):
    entries = []
    current_entry = None
    
    # Regex to match the start of an entry: "2809.00 24/12/2025 Sale" or "34716.00 25/07/2025 SRet"
    # Actually, the date might be connected to the amount: "34716.0025/07/2025 SRet"
    entry_start_pattern = re.compile(r'^(\d+\.\d{2})\s*(\d{2}/\d{2}/\d{4})\s+(Sale|SRet)')
    qty_pattern = re.compile(r'Qty\s*:\s*(\d+(?:\.\d+)?)\s+Rate\s*:\s*(\d+(?:\.\d+)?)')
    
    lines = text.split('\n')
    for line in lines:
        line = line.strip()
        if not line: continue
        
        match = entry_start_pattern.search(line)
        if match:
            amount, date_str, type_str = match.groups()
            date_obj = datetime.strptime(date_str, "%d/%m/%Y")
            current_entry = {
                'date': date_obj,
                'type': type_str,
                'products': [],
                'temp_product_name': []
            }
            entries.append(current_entry)
        elif current_entry:
            # Check if this line is a Qty line
            qty_match = qty_pattern.search(line)
            if qty_match:
                qty = float(qty_match.group(1))
                rate = float(qty_match.group(2))
                # The product name is the lines we accumulated
                # Filter out 'Sales A/c. (GST)', 'Bill No ...', 'SCB'
                skip_phrases = ['Sales A/c.', 'Bill No', 'SCB']
                prod_lines = []
                for pline in current_entry['temp_product_name']:
                    skip = False
                    for sp in skip_phrases:
                        if sp in pline:
                            skip = True
                            break
                    if not skip:
                        prod_lines.append(pline)
                
                product_name = " ".join(prod_lines).strip()
                if product_name:
                    current_entry['products'].append({
                        'name': product_name,
                        'qty': qty
                    })
                # clear temp name for next product in the same entry
                current_entry['temp_product_name'] = []
            else:
                current_entry['temp_product_name'].append(line)
                
    return entries

# Let's test with a snippet
sample_right = """
2390.00 20/11/2025 Sale
Sales A/c. (GST)
Bill No SSBT25-26/5056
SCB
Force-10 1KG
Qty : 25.000 Rate : 81.00
3068.00 02/12/2025 Sale
Sales A/c. (GST)
Bill No SSBT25-26/5372
SCB
Silver Grip 8gm
Qty : 100.000 Rate : 26.00
10431.0006/12/2025 Sale
Sales A/c. (GST)
Bill No SSBT25-26/5515
Nutrient Green 1ltr
Qty : 10.000 Rate : 170.00
Nutrient Green 1ltr
Qty : 20.000 Rate : 170.00
Nutrient Green 500ml
Qty : 40.000 Rate : 93.50
"""

sample_left = """
34716.00 25/07/2025 SRet
Sales A/c. (GST)
Bill No Cn85
Mono Sine 1ltr
Qty : 10.000 Rate : 430.00
Mono Sine 500ml
Qty : 4.000 Rate : 225.00
"""

print("RIGHT (Sales):", parse_text(sample_right, True))
print("LEFT (SRet):", parse_text(sample_left, False))
