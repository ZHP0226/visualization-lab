# SPDX-License-Identifier: MIT
"""将渲染图放入单页 PDF。依赖：pip install reportlab pillow。PDF 内是位图。"""
import argparse
from pathlib import Path
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('png', type=Path)
parser.add_argument('pdf', type=Path)
args = parser.parse_args()
with Image.open(args.png) as image:
    width, height = image.size
    page = (width * 72 / 300, height * 72 / 300)
    output = canvas.Canvas(str(args.pdf), pagesize=page, pageCompression=1)
    output.setTitle('Dark-studio metal chip')
    output.setAuthor('ZHP0226')
    output.setSubject('Cinema 4D render, raster image at 300 dpi, arbitrary scene units')
    output.drawImage(ImageReader(image), 0, 0, width=page[0], height=page[1])
    output.showPage()
    output.save()
