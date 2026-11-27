import re

with open(r'c:\Users\zimfv\OneDrive\Desktop\School Docs\2025-2026\teachflow\quizable\index.html', 'r', encoding='utf-8') as f:
    html = f.read()

for m in re.finditer(r'.{0,50}quiz-subject.{0,80}', html):
    print("HTML:", m.group(0).strip())

with open(r'c:\Users\zimfv\OneDrive\Desktop\School Docs\2025-2026\teachflow\quizable\script.js', 'r', encoding='utf-8') as f:
    js = f.read()

for m in re.finditer(r'.{0,50}quiz-subject.{0,80}', js):
    print("JS:", m.group(0).strip())
