"""Synthetic, non-user test PDF: native text, Chinese text, raster page, blank page."""
import sys
from pathlib import Path
import pymupdf as fitz

folder = Path(sys.argv[1])
doc = fitz.open()
page = doc.new_page()
page.insert_text((72, 72), "API policy default is OFF. Change is -112, not +112.")
page = doc.new_page()
page.insert_text((72, 72), "审批策略默认关闭。图表支持逐页核对。", fontname="china-s")
scan = fitz.open()
scan_page = scan.new_page()
scan_page.insert_text((72, 72), "RASTER-ONLY: torque is 42 Nm")
page = doc.new_page()
page.insert_image(page.rect, stream=scan_page.get_pixmap().tobytes("png"))
doc.new_page()
doc.set_toc([[1, "Policy", 1], [1, "Scan", 3]])
doc.save(folder / "manual.pdf")
doc.close()
scan.close()
