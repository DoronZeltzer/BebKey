"""
Regenerate every PNG/ICO brand asset from the official bk logo art.

Source of truth (committed): public/logo-mark.png (the color monogram — white
"b" + orange "k") and public/logo-wordmark.png. This script composites the mark
onto the brand-blue rounded tile at each size, so all icons are pixel-faithful
to the supplied art. Run after the logo art changes:

    python scripts/render_icons.py

Generates: favicon-16/32, apple-touch-icon (180), icon-192/512, PWA maskable,
icon-google-avatar (720), favicon.ico (16/32/48), og-image.png (1200x630).
"""
import base64
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

BLUE = (30, 64, 175)      # #1E40AF brand blue
ORANGE = (245, 158, 11)   # #F59E0B (used in og text accent)
PAPER = (250, 250, 248)   # #FAFAF8
SS = 4                    # supersample factor for smooth rounded corners

_mark = Image.open(PUBLIC / "logo-mark.png").convert("RGBA")
_mark = _mark.crop(_mark.getbbox())          # tight-crop to the art
_word = Image.open(PUBLIC / "logo-wordmark.png").convert("RGBA")
_word = _word.crop(_word.getbbox())


def _fit(img: Image.Image, box_w: int, box_h: int) -> Image.Image:
    # Scale to fit the box preserving aspect ratio — up OR down (thumbnail only
    # shrinks, which left the small source art tiny inside the big tiles).
    r = min(box_w / img.width, box_h / img.height)
    return img.resize((max(1, round(img.width * r)), max(1, round(img.height * r))),
                      Image.LANCZOS)


def blue_tile(size: int, pad_frac: float = 0.16, radius_frac: float = 0.22,
              flatten: bool = False) -> Image.Image:
    """Brand-blue rounded square with the mark centered."""
    S = size * SS
    tile = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(tile)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * radius_frac),
                        fill=BLUE + (255,))
    inner = int(S * (1 - 2 * pad_frac))
    m = _fit(_mark, inner, inner)
    tile.alpha_composite(m, ((S - m.width) // 2, (S - m.height) // 2))
    out = tile.resize((size, size), Image.LANCZOS)
    if flatten:
        bg = Image.new("RGB", (size, size), BLUE)
        bg.paste(out, (0, 0), out)
        out = bg
    return out


def save(img: Image.Image, name: str):
    img.save(PUBLIC / name)
    print(f"  wrote public/{name}  ({img.size[0]}x{img.size[1]})")


def write_favicon_svg():
    """favicon.svg = blue rounded tile + the real mark embedded, so SVG-favicon
    browsers show the exact art (matching the PNG icons)."""
    b64 = base64.b64encode((PUBLIC / "logo-mark.png").read_bytes()).decode()
    mw = 348
    mh = round(mw * _mark.height / _mark.width)  # keep aspect
    x, y = (512 - mw) // 2, (512 - mh) // 2
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
        '<rect width="512" height="512" rx="114" fill="#1E40AF"/>'
        f'<image x="{x}" y="{y}" width="{mw}" height="{mh}" '
        f'href="data:image/png;base64,{b64}"/></svg>'
    )
    (PUBLIC / "favicon.svg").write_text(svg, encoding="utf-8")
    print(f"  wrote public/favicon.svg  ({len(svg):,} bytes)")


def main():
    write_favicon_svg()
    # Favicons + app icons (mark on blue tile)
    save(blue_tile(16,  pad_frac=0.12, radius_frac=0.16), "favicon-16x16.png")
    save(blue_tile(32,  pad_frac=0.13, radius_frac=0.18), "favicon-32x32.png")
    save(blue_tile(180, flatten=True), "apple-touch-icon.png")  # iOS: no alpha
    save(blue_tile(192), "icon-192.png")
    save(blue_tile(512), "icon-512.png")
    # Maskable PWA icon: extra padding so nothing is cropped by the OS mask.
    save(blue_tile(512, pad_frac=0.26, radius_frac=0.30), "icon-512-maskable.png")
    # Google-account / social avatar: crops to a circle, so keep it well padded.
    save(blue_tile(720, pad_frac=0.20, radius_frac=0.24, flatten=True),
         "icon-google-avatar.png")

    # favicon.ico (multi-size 16/32/48)
    ico = [blue_tile(16, 0.12, 0.16), blue_tile(32, 0.13, 0.18), blue_tile(48, 0.14, 0.20)]
    ico[0].save(PUBLIC / "favicon.ico", format="ICO",
                sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[1:])
    print("  wrote public/favicon.ico  (16/32/48)")

    # OG card 1200x630: mark + wordmark centered on blue, tagline under.
    W, H = 1200, 630
    og = Image.new("RGBA", (W * SS, H * SS), BLUE + (255,))
    mk = _fit(_mark, int(160 * SS), int(160 * SS))
    wd = _fit(_word, int(560 * SS), int(150 * SS))
    gap = int(28 * SS)
    total_w = mk.width + gap + wd.width
    x0 = (W * SS - total_w) // 2
    cy = int(272 * SS)
    og.alpha_composite(mk, (x0, cy - mk.height // 2))
    og.alpha_composite(wd, (x0 + mk.width + gap, cy - wd.height // 2))
    try:
        font = ImageFont.truetype("arialbd.ttf", int(40 * SS))
    except Exception:
        font = ImageFont.load_default()
    tag = "Israel Real Estate — All in One Place"
    d = ImageDraw.Draw(og)
    tb = d.textbbox((0, 0), tag, font=font)
    d.text(((W * SS - (tb[2] - tb[0])) // 2, int(430 * SS)), tag,
           fill=PAPER + (255,), font=font)
    og.convert("RGB").resize((W, H), Image.LANCZOS).save(PUBLIC / "og-image.png")
    print(f"  wrote public/og-image.png  ({W}x{H})")


if __name__ == "__main__":
    main()
