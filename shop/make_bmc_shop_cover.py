"""Render a low-detail BMC shop banner at 1600x400 (drawn at 2x)."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "bmc-shop-cover.png"
LOGO = ROOT.parent / "Projekt bez nazwy.png"

NAVY = (1, 33, 105)
WHITE = (255, 255, 255)

W, H = 3200, 800
FINAL = (1600, 400)
BOLD = r"C:\Windows\Fonts\segoeuib.ttf"


def main():
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)

    logo = Image.open(LOGO).convert("RGBA")
    logo.thumbnail((1400, 520), Image.Resampling.LANCZOS)

    title = "Writing Suite"
    fnt = ImageFont.truetype(BOLD, 48)
    bbox = d.textbbox((0, 0), title, font=fnt)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    gap = 28
    block_h = logo.height + gap + th
    top = (H - block_h) // 2

    img.paste(logo, ((W - logo.width) // 2, top), logo)
    d.text(((W - tw) // 2, top + logo.height + gap), title, font=fnt, fill=NAVY)

    out = img.resize(FINAL, Image.Resampling.LANCZOS)
    out.save(OUT, "PNG", optimize=True)
    print(f"Wrote {OUT} {out.size[0]}x{out.size[1]}")


if __name__ == "__main__":
    main()
