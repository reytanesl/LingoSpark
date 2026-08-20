"""
LingoSpark — FB & IG Reels Pack (PL) v2
Dynamic motion graphics: no emojis, vector icons, animated gradients, scene transitions.
1080x1920, 14s, 30fps, upbeat BGM.
"""
from __future__ import annotations

import math
import os
import struct
import subprocess
import textwrap
import wave
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
FFMPEG_CANDIDATES = [
    Path(
        r"C:\Users\karol\AppData\Local\Microsoft\WinGet\Packages"
        r"\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe"
        r"\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"
    ),
    Path("ffmpeg"),
]

W, H = 1080, 1920
FPS = 30
DURATION_SEC = 14.0
TOTAL_FRAMES = int(DURATION_SEC * FPS)

BLUE = (1, 33, 105)
RED = (200, 16, 46)
GREEN = (0, 130, 59)
GOLD = (245, 166, 35)
WHITE = (255, 255, 255)
GREY = (244, 245, 247)
DARK = (45, 45, 45)
MUTED = (90, 90, 90)
BORDER = (224, 224, 224)
OK_BG = (232, 245, 233)
BLUE_LIGHT = (235, 242, 255)
YELLOW_LIGHT = (255, 248, 225)
RED_LIGHT = (255, 235, 238)
BLUE_DEEP = (0, 22, 70)


def find_ffmpeg() -> Path:
    for p in FFMPEG_CANDIDATES:
        if p.name == "ffmpeg":
            from shutil import which
            found = which("ffmpeg")
            if found:
                return Path(found)
        elif p.exists():
            return p
    raise FileNotFoundError("ffmpeg not found")


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    paths = [
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
    ]
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def ease_out_cubic(t: float) -> float:
    t = clamp(t)
    return 1 - (1 - t) ** 3


def ease_in_out_quad(t: float) -> float:
    t = clamp(t)
    return 2 * t * t if t < 0.5 else 1 - (-2 * t + 2) ** 2 / 2


def bounce_out(t: float) -> float:
    t = clamp(t)
    n1, d1 = 7.5625, 2.75
    if t < 1 / d1:
        return n1 * t * t
    if t < 2 / d1:
        t -= 1.5 / d1
        return n1 * t * t + 0.75
    if t < 2.5 / d1:
        t -= 2.25 / d1
        return n1 * t * t + 0.9375
    t -= 2.625 / d1
    return n1 * t * t + 0.984375


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * clamp(t)


def mix_color(c1, c2, t):
    t = clamp(t)
    return tuple(int(lerp(c1[i], c2[i], t)) for i in range(3))


def rounded_rect(draw, box, fill, radius=16, outline=None, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def wrap(text: str, width: int = 28) -> list[str]:
    return textwrap.wrap(text, width=width) or [""]


# ---------------------------------------------------------------------------
# Visual system
# ---------------------------------------------------------------------------

def draw_animated_bg(img: Image.Image, t_sec: float, accent=BLUE, accent2=RED):
    """Fast banded gradient + drifting shapes (no per-pixel loop)."""
    draw = ImageDraw.Draw(img)
    for y in range(0, H, 12):
        u = y / H
        wave = 0.35 + 0.25 * math.sin(u * math.pi * 2 + t_sec * 1.2)
        base = mix_color(GREY, BLUE_LIGHT, wave)
        if math.sin(u * 8 + t_sec * 2.5) > 0.55:
            base = mix_color(base, accent, 0.14)
        draw.rectangle((0, y, W, y + 12), fill=base)
    # drifting accent blobs
    for i, col in enumerate((accent, accent2, GOLD)):
        bx = int((math.sin(t_sec * 0.7 + i * 2.1) * 0.5 + 0.5) * W)
        by = int((math.cos(t_sec * 0.5 + i * 1.3) * 0.5 + 0.5) * H)
        r = 180 + int(40 * math.sin(t_sec + i))
        overlay = Image.new("RGB", (W, H), col)
        mask = Image.new("L", (W, H), 0)
        ImageDraw.Draw(mask).ellipse((bx - r, by - r, bx + r, by + r), fill=28)
        img.paste(Image.blend(img, overlay, 0.12), mask=mask)


def draw_particles(draw: ImageDraw.ImageDraw, t_sec: float, seed: int = 0, color=GOLD):
    for i in range(28):
        phase = (i * 0.37 + seed) % 1.0
        px = (math.sin(t_sec * 0.9 + i * 1.7) * 0.5 + 0.5) * W
        py = ((t_sec * 140 + i * 73) % (H + 100)) - 50
        r = 3 + (i % 4)
        alpha = 0.35 + 0.25 * math.sin(t_sec * 3 + i)
        c = mix_color(color, WHITE, 1 - alpha)
        draw.ellipse((px - r, py - r, px + r, py + r), fill=c)


def draw_accent_sweep(draw, t_sec: float, y: int, color=RED):
    w = int(W * (0.3 + 0.7 * abs(math.sin(t_sec * 1.5))))
    x = int((W - w) * ((t_sec * 0.4) % 1.0))
    rounded_rect(draw, (x - 40, y, x + w, y + 8), color, radius=4)


def draw_top_bar(draw, t_sec: float, slide_in: float = 1.0):
    ty = int(-180 + 180 * ease_out_cubic(slide_in))
    rounded_rect(draw, (48, 50 + ty, W - 48, 160 + ty), WHITE, radius=18, outline=BORDER, width=2)
    draw.text((80, 80 + ty), "Lingo", font=font(44, True), fill=BLUE)
    draw.text((215, 80 + ty), "Spark", font=font(44, True), fill=RED)
    pill_w = 280 + int(8 * math.sin(t_sec * 4))
    rounded_rect(draw, (W - pill_w - 80, 78 + ty, W - 80, 132 + ty), BLUE_LIGHT, radius=20, outline=BLUE, width=2)
    draw.text((W - pill_w - 55, 90 + ty), "lingospark.study", font=font(24, True), fill=BLUE)


def draw_headline_anim(draw, t_sec: float, y: int, tag: str, lines: list[str], delay: float = 0.0):
    p = ease_out_cubic(clamp((t_sec - delay) / 0.7))
    if p <= 0:
        return
    oy = int((1 - p) * 80)
    draw.text((70, y + oy), tag, font=font(28, True), fill=RED)
    for i, line in enumerate(lines):
        lp = ease_out_cubic(clamp((t_sec - delay - 0.15 - i * 0.12) / 0.65))
        if lp <= 0:
            continue
        ly = int((1 - lp) * 60)
        col = BLUE if i == 0 else RED
        draw.text((70, y + 48 + i * 62 + oy + ly), line, font=font(52, True), fill=col)


def draw_cta_button(draw, y: int, text: str, t_sec: float, bg=RED, delay: float = 0.0):
    p = bounce_out(clamp((t_sec - delay) / 0.55))
    if p <= 0:
        return
    pulse = 1.0 + 0.04 * math.sin(t_sec * 7)
    bw = int(880 * p * pulse)
    bx = (W - bw) // 2
    rounded_rect(draw, (bx, y, bx + bw, y + 100), bg, radius=28)
    tw = draw.textbbox((0, 0), text, font=font(32, True))[2]
    draw.text((W // 2 - tw // 2, y + 28), text, font=font(32, True), fill=WHITE)
    ax = bx + bw - 50
    draw.polygon([(ax, y + 50), (ax + 18, y + 38), (ax + 18, y + 62)], fill=WHITE)


def draw_icon_badge(draw, cx, cy, r, letter: str, color, ring_pulse: float = 0.0):
    ring = r + 6 + int(4 * math.sin(ring_pulse * 6))
    draw.ellipse((cx - ring, cy - ring, cx + ring, cy + ring), outline=color, width=3)
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)
    tw = draw.textbbox((0, 0), letter, font=font(int(r * 1.1), True))[2]
    th = draw.textbbox((0, 0), letter, font=font(int(r * 1.1), True))[3]
    draw.text((cx - tw / 2, cy - th / 2 - 4), letter, font=font(int(r * 1.1), True), fill=WHITE)


def draw_icon_flashcard(draw, cx, cy, scale: float = 1.0):
    s = scale
    for i, off in enumerate((0, 8, 16)):
        rounded_rect(draw, (cx - 50 * s + off, cy - 35 * s + off, cx + 50 * s + off, cy + 35 * s + off),
                       WHITE if i == 2 else BLUE_LIGHT, radius=8, outline=BLUE, width=2)


def draw_icon_bomb(draw, cx, cy, pulse: float):
    r = 55 + 8 * pulse
    draw.ellipse((cx - r, cy - r + 10, cx + r, cy + r + 10), fill=RED, outline=BLUE_DEEP, width=4)
    draw.line((cx, cy - r + 10, cx + 20, cy - r - 30), fill=DARK, width=5)
    draw.ellipse((cx + 22, cy - r - 38, cx + 34, cy - r - 26), fill=GOLD)


def draw_icon_grid(draw, cx, cy, size: float = 1.0):
    cell = 28 * size
    gap = 6 * size
    for row in range(3):
        for col in range(3):
            x1 = cx - 1.5 * cell + col * (cell + gap)
            y1 = cy - 1.5 * cell + row * (cell + gap)
            fill = BLUE if (row + col) % 2 == 0 else BLUE_LIGHT
            rounded_rect(draw, (x1, y1, x1 + cell, y1 + cell), fill, radius=6, outline=BLUE, width=2)


def draw_icon_pen(draw, cx, cy, scale: float = 1.0):
    s = scale
    draw.polygon([(cx - 8 * s, cy + 40 * s), (cx + 8 * s, cy + 40 * s), (cx + 3 * s, cy - 30 * s),
                  (cx - 3 * s, cy - 30 * s)], fill=GREEN)
    draw.polygon([(cx - 3 * s, cy - 30 * s), (cx + 3 * s, cy - 30 * s), (cx, cy - 50 * s)], fill=GOLD)


def draw_sparkle_burst(draw, cx, cy, progress: float, radius=100, color=GOLD):
    if progress <= 0 or progress >= 1:
        return
    r = radius * ease_out_cubic(progress)
    for i in range(12):
        ang = (2 * math.pi / 12) * i + progress * 2
        px = cx + math.cos(ang) * r
        py = cy + math.sin(ang) * r
        s = max(2, int(12 * (1 - progress)))
        draw.line((cx, cy, px, py), fill=color, width=max(1, s // 3))
        draw.ellipse((px - s, py - s, px + s, py + s), fill=color)


def draw_stamp(draw, cx, cy, text, sub="", progress: float = 1.0, color=GREEN):
    if progress <= 0:
        return
    sc = 0.5 + 0.5 * bounce_out(progress)
    w, h = 520 * sc, 130 * sc if sub else 100 * sc
    rounded_rect(draw, (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2), WHITE, radius=18, outline=color, width=5)
    tw = draw.textbbox((0, 0), text, font=font(34, True))[2]
    draw.text((cx - tw / 2, cy - h / 2 + 22), text, font=font(34, True), fill=color)
    if sub:
        sw = draw.textbbox((0, 0), sub, font=font(22, True))[2]
        draw.text((cx - sw / 2, cy - h / 2 + 68), sub, font=font(22, True), fill=MUTED)


def draw_card_slide(draw, box, fill, outline, t_sec, delay, from_left=True):
    p = ease_out_cubic(clamp((t_sec - delay) / 0.55))
    if p <= 0:
        return False
    x1, y1, x2, y2 = box
    w = x2 - x1
    offset = int((1 - p) * (W + 100) * (1 if from_left else -1))
    rounded_rect(draw, (x1 + offset, y1, x2 + offset, y2), fill, radius=22, outline=outline, width=4)
    return True


def draw_typing_line(draw, x, y, w, text, t_sec, start: float, cps: float = 7.0):
    p = clamp((t_sec - start) * cps)
    shown = text[: int(p)]
    cursor = "|" if int(t_sec * 4) % 2 == 0 and p < len(text) else ""
    rounded_rect(draw, (x, y, x + w, y + 70), BLUE_LIGHT, radius=14, outline=BLUE, width=3)
    draw.text((x + 20, y + 16), shown + cursor, font=font(36, True), fill=BLUE)


def draw_progress_bar(draw, x, y, w, progress, color=BLUE):
    rounded_rect(draw, (x, y, x + w, y + 14), BORDER, radius=7)
    rounded_rect(draw, (x, y, x + int(w * clamp(progress)), y + 14), color, radius=7)


# --- BGM ---
NOTES = {"C4": 261.63, "D4": 293.66, "E4": 329.63, "F4": 349.23,
         "G4": 392.00, "A4": 440.00, "B4": 493.88, "C5": 523.25,
         "D5": 587.33, "E5": 659.25, "G5": 783.99, "REST": 0.0}
SAMPLE_RATE = 44100


def _env(i: int, n: int) -> float:
    if n <= 0:
        return 0.0
    t = i / n
    return clamp(min(t / 0.03, 1.0) * min((1 - t) / 0.06, 1.0))


def _tone(freq: float, seconds: float, amp: float = 0.15) -> list[float]:
    n = int(SAMPLE_RATE * seconds)
    out = [0.0] * n
    if freq <= 0:
        return out
    for i in range(n):
        phase = 2 * math.pi * freq * (i / SAMPLE_RATE)
        out[i] = amp * math.sin(phase) * _env(i, n)
    return out


def generate_bgm(path: Path, variant: int = 0):
    roots = [
        [("E5", 0.2), ("G5", 0.2), ("C5", 0.3), ("D5", 0.2), ("E5", 0.4), ("REST", 0.2)],
        [("G5", 0.2), ("E5", 0.2), ("D5", 0.3), ("C5", 0.2), ("D5", 0.4), ("REST", 0.2)],
        [("C5", 0.25), ("E5", 0.25), ("G5", 0.25), ("D5", 0.25)],
    ]
    melody = roots[variant % len(roots)]
    bass_cycle = ["C4", "G4", "A4", "F4"]
    total = int(SAMPLE_RATE * DURATION_SEC)
    buf = [0.0] * total
    pos = 0
    bar = 0
    while pos < total:
        root = bass_cycle[bar % 4]
        chord_len = min(int(0.5 * SAMPLE_RATE), total - pos)
        for i in range(chord_len):
            if pos + i < total:
                t = (pos + i) / SAMPLE_RATE
                buf[pos + i] += 0.04 * math.sin(2 * math.pi * NOTES[root] * t)
                buf[pos + i] += 0.025 * math.sin(2 * math.pi * NOTES[root] * 2 * t)
        mpos = pos
        for name, dur in melody:
            if mpos >= total:
                break
            seg = _tone(NOTES[name], dur, amp=0.12 + 0.02 * (variant % 3))
            for j, v in enumerate(seg):
                if mpos + j < total:
                    buf[mpos + j] += v
            mpos += int(dur * SAMPLE_RATE)
        pos += int(0.5 * SAMPLE_RATE)
        bar += 1
    fade = int(0.4 * SAMPLE_RATE)
    for i in range(fade):
        buf[i] *= i / fade
        buf[total - 1 - i] *= i / fade
    peak = max(abs(x) for x in buf) or 1.0
    buf = [clamp(x / peak * 0.85, -1.0, 1.0) for x in buf]
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(b"".join(struct.pack("<h", int(x * 32767)) for x in buf))


def mux_audio(video: Path, audio: Path, out: Path):
    ffmpeg = find_ffmpeg()
    subprocess.run([
        str(ffmpeg), "-y", "-i", str(video), "-i", str(audio),
        "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest",
        "-map", "0:v:0", "-map", "1:a:0", str(out),
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def render_reel(name: str, render_fn, bgm_variant: int = 0) -> Path:
    frames_dir = ROOT / f"frames_{name}"
    frames_dir.mkdir(parents=True, exist_ok=True)
    print(f"Rendering {name} ({TOTAL_FRAMES} frames)...")
    for fi in range(TOTAL_FRAMES):
        t_sec = fi / FPS
        img = Image.new("RGB", (W, H), GREY)
        draw = ImageDraw.Draw(img)
        render_fn(img, draw, t_sec, fi / TOTAL_FRAMES)
        img.save(frames_dir / f"frame_{fi:04d}.png", "PNG")

    silent = ROOT / f"{name}_silent.mp4"
    ffmpeg = find_ffmpeg()
    subprocess.run([
        str(ffmpeg), "-y", "-framerate", str(FPS),
        "-i", str(frames_dir / "frame_%04d.png"),
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-t", str(DURATION_SEC), str(silent),
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    bgm = ROOT / f"bgm_{name}.wav"
    generate_bgm(bgm, bgm_variant)
    final = ROOT / f"{name}.mp4"
    mux_audio(silent, bgm, final)
    silent.unlink(missing_ok=True)
    print(f"[OK] {final.name}")
    return final


# =============================================================================
# REEL 1 — Overview
# =============================================================================
def reel01(img, draw, t_sec, t):
    draw_animated_bg(img, t_sec, BLUE, RED)
    draw_particles(draw, t_sec, 1, GOLD)
    draw_top_bar(draw, t_sec, slide_in=clamp(t_sec / 0.5))

    if t_sec < 4.2:
        draw_accent_sweep(draw, t_sec, 175, RED)
        draw_headline_anim(draw, t_sec, 200, "NOWA ERA NAUKI ESL", ["Angielski", "bez nudy!"])
        badges = [
            ("Vocab — FREE FOREVER", "Fiszki, bomba, grid, aukcja", BLUE, BLUE_LIGHT, "V"),
            ("Team Challenge", "Gry na tablicę i projektor", RED, RED_LIGHT, "T"),
            ("Writing Suite", "AI + feedback w czasie rzeczywistym", GREEN, OK_BG, "W"),
        ]
        for i, (title, sub, col, bg, letter) in enumerate(badges):
            d = t_sec - 0.5 - i * 0.35
            if d <= 0:
                continue
            by = 520 + i * 210
            bx = int(60 + (1 - bounce_out(clamp(d / 0.55))) * -350)
            rounded_rect(draw, (bx, by, W - 60, by + 170), bg, radius=22, outline=col, width=4)
            draw_icon_badge(draw, bx + 70, by + 85, 38, letter, col, t_sec + i)
            draw.text((bx + 140, by + 35), title, font=font(32, True), fill=col)
            draw.text((bx + 140, by + 85), sub, font=font(24), fill=MUTED)
            draw_progress_bar(draw, bx + 140, by + 130, 400, clamp(d / 0.8), col)

    elif t_sec < 9.0:
        wipe = ease_in_out_quad(clamp((t_sec - 4.2) / 0.4))
        draw_headline_anim(draw, t_sec, 200, "3 SEKCJE PLATFORMY", ["Vocab · Team", "· Writing"], delay=4.2)
        hubs = [
            ("Vocab Review", "Fiszki · Bomba · Grid · Aukcja", BLUE, "V", 420, True),
            ("Team Challenge", "Wordle · Scramble · Tablica", RED, "T", 780, False),
            ("Writing Suite", "Eseje · Egzamin · Primary English", GREEN, "W", 1140, True),
        ]
        for i, (title, sub, col, letter, hy, from_left) in enumerate(hubs):
            ok = draw_card_slide(draw, (60, hy, W - 60, hy + 280), WHITE, col, t_sec, 4.4 + i * 0.25, from_left)
            if ok:
                draw_icon_badge(draw, 130, hy + 140, 42, letter, col, t_sec)
                draw.text((210, hy + 50), title, font=font(38, True), fill=col)
                draw.text((210, hy + 110), sub, font=font(26), fill=MUTED)
                if (t_sec - 5.5 - i * 0.3) > 0:
                    rounded_rect(draw, (210, hy + 180, 480, hy + 240), col, radius=18)
                    draw.text((240, hy + 195), "Otwórz sekcję", font=font(24, True), fill=WHITE)
        _ = wipe

    else:
        p = bounce_out(clamp((t_sec - 9.0) / 0.7))
        cx, cy = W // 2, 900
        cw, ch = int(960 * p), int(1180 * p)
        rounded_rect(draw, (cx - cw // 2, cy - ch // 2, cx + cw // 2, cy + ch // 2), WHITE, radius=32, outline=BLUE, width=6)
        draw.text((cx - 380, cy - ch // 2 + 80), "ZACZNIJ DZIŚ", font=font(36, True), fill=RED)
        draw.text((cx - 380, cy - ch // 2 + 140), "lingospark.study", font=font(58, True), fill=BLUE)
        for i, line in enumerate(wrap("Darmowe gry słownictwa i AI do pisania — w jednym miejscu.", 24)):
            draw.text((cx - 380, cy - ch // 2 + 260 + i * 44), line, font=font(30), fill=DARK)
        draw_sparkle_burst(draw, cx, cy + 120, clamp((t_sec - 10) / 0.7), 130, GOLD)
        draw_cta_button(draw, cy + ch // 2 - 180, "WEJDŹ NA LINGOSPARK", t_sec, RED, delay=9.2)


# =============================================================================
# REEL 2 — Wklej słówka
# =============================================================================
def reel02(img, draw, t_sec, t):
    draw_animated_bg(img, t_sec, GREEN, BLUE)
    draw_particles(draw, t_sec, 2, GREEN)
    draw_top_bar(draw, t_sec, slide_in=1.0)
    draw_headline_anim(draw, t_sec, 190, "ZERO PRZYGOTOWAŃ", ["Wklej listę", "słówek → graj!"])

    box_y = 420
    slide = ease_out_cubic(clamp((t_sec - 0.3) / 0.6))
    by_off = int((1 - slide) * 200)
    rounded_rect(draw, (60, box_y + by_off, W - 60, box_y + 520 + by_off), WHITE, radius=24, outline=BLUE, width=5)
    draw.text((100, box_y + 30 + by_off), "TWOJA LISTA", font=font(32, True), fill=BLUE)

    sample = ["massive = ogromny", "swift = szybki", "ancient = starożytny", "brilliant = genialny"]
    for i, line in enumerate(sample):
        lp = clamp((t_sec - 0.8 - i * 0.35) / 0.4)
        if lp <= 0:
            continue
        lx = int(100 + (1 - ease_out_cubic(lp)) * -400)
        draw.text((lx, box_y + 100 + i * 52 + by_off), line, font=font(28), fill=DARK)

    if t_sec > 3.2:
        sp = bounce_out(clamp((t_sec - 3.2) / 0.5))
        rounded_rect(draw, (60, 980, W - 60, 1180), OK_BG, radius=20, outline=GREEN, width=4)
        draw.text((100, 1040), "GOTOWE W 10 SEKUND", font=font(36, True), fill=GREEN)
        draw_progress_bar(draw, 100, 1110, W - 200, clamp((t_sec - 3.2) / 1.5), GREEN)

    games = [("Fiszki", draw_icon_flashcard), ("Bomba", draw_icon_bomb), ("Grid", draw_icon_grid), ("Aukcja", None)]
    for i, (name, icon_fn) in enumerate(games):
        d = t_sec - 5.0 - i * 0.2
        if d <= 0:
            continue
        gx = 80 + (i % 2) * 480
        gy = 1240 + (i // 2) * 150
        sc = bounce_out(clamp(d / 0.45))
        gw = int(440 * sc)
        rounded_rect(draw, (gx, gy, gx + gw, gy + 110), BLUE_LIGHT, radius=18, outline=BLUE, width=3)
        if icon_fn:
            icon_fn(draw, gx + 55, gy + 55, 0.7 + 0.1 * math.sin(t_sec * 4 + i))
        else:
            draw_icon_badge(draw, gx + 55, gy + 55, 28, "A", GOLD, t_sec)
        draw.text((gx + 110, gy + 38), name, font=font(30, True), fill=BLUE)

    draw_cta_button(draw, 1580, "GRAJ ZA DARMO", t_sec, GREEN, delay=10.0)


# =============================================================================
# REEL 3 — Bomba
# =============================================================================
def reel03(img, draw, t_sec, t):
    pulse = 0.5 + 0.5 * math.sin(t_sec * 8)
    draw_animated_bg(img, t_sec, RED, BLUE_DEEP)
    draw_particles(draw, t_sec, 3, RED)
    draw_top_bar(draw, t_sec)

    flash = abs(math.sin(t_sec * 10)) > 0.55 if t_sec < 3 else False
    panel_fill = RED_LIGHT if flash else WHITE
    rounded_rect(draw, (40, 180, W - 40, 1700), panel_fill, radius=28, outline=RED, width=6)

    draw.text((80, 240), "PRESJA CZASU", font=font(32, True), fill=RED)
    draw_headline_anim(draw, t_sec, 290, "", ["Rozbroj bombę", "słownictwa!"], delay=0.2)

    draw_icon_bomb(draw, W // 2, 520, pulse)
    secs = max(0, 60 - int((t_sec - 1) * 14))
    timer_scale = 1.0 + 0.06 * pulse
    tw = int(320 * timer_scale)
    rounded_rect(draw, (80, 650, 80 + tw, 780), RED, radius=18)
    draw.text((120, 680), f"00:{secs:02d}", font=font(48, True), fill=WHITE)

    if t_sec > 2:
        rounded_rect(draw, (80, 820, W - 80, 980), WHITE, radius=18, outline=BORDER, width=2)
        draw.text((110, 850), "Definicja: bardzo duży, ogromny", font=font(28), fill=DARK)
        draw_typing_line(draw, 110, 900, W - 220, "MASSIVE", t_sec, 2.4, cps=8)

    if t_sec > 5:
        draw_stamp(draw, W // 2, 1150, "POPRAWNIE", "+5 sekund bonusu", clamp((t_sec - 5) / 0.45), GREEN)
        draw_sparkle_burst(draw, W // 2, 1150, clamp((t_sec - 5) / 0.6), 90, GREEN)

    if t_sec > 7.5:
        draw.text((80, 1300), "Idealne przed sprawdzianem", font=font(34, True), fill=GREEN)
        draw_cta_button(draw, 1480, "LINGOSPARK.STUDY", t_sec, RED, delay=7.8)


# =============================================================================
# REEL 4 — Klasa
# =============================================================================
def reel04(img, draw, t_sec, t):
    draw_animated_bg(img, t_sec, RED, GOLD)
    draw_particles(draw, t_sec, 4, RED)
    draw_top_bar(draw, t_sec)
    draw_headline_anim(draw, t_sec, 190, "DLA NAUCZYCIELA", ["Gry na tablicę", "i projektor"])

    tiles = [
        ("Wordle", "Zgadnij słowo w 6 próbach", RED, "W"),
        ("Sentence Scramble", "Układaj zdania na czas", BLUE, "S"),
        ("Word Chain", "Łańcuch słów — kto dalej?", GREEN, "C"),
        ("Quintagrams", "5 podpowiedzi, 1 słowo", GOLD, "Q"),
    ]
    for i, (title, sub, col, letter) in enumerate(tiles):
        ty = 450 + i * 280
        ok = draw_card_slide(draw, (60, ty, W - 60, ty + 230), WHITE, col, t_sec, 0.3 + i * 0.3, from_left=(i % 2 == 0))
        if ok:
            draw_icon_badge(draw, 130, ty + 115, 40, letter, col, t_sec + i)
            draw.text((200, ty + 45), title, font=font(36, True), fill=col)
            draw.text((200, ty + 100), sub, font=font(26), fill=MUTED)
            # animated underline
            uw = int((W - 280) * ease_out_cubic(clamp((t_sec - 0.8 - i * 0.3) / 0.6)))
            draw.line((200, ty + 180, 200 + uw, ty + 180), fill=col, width=4)

    if t_sec > 8:
        p = ease_out_cubic(clamp((t_sec - 8) / 0.5))
        rounded_rect(draw, (60, 1580, W - 60, 1720), RED_LIGHT, radius=20, outline=RED, width=3)
        draw.text((100, 1620), "Vocab + Team Challenge = FREE FOREVER", font=font(28, True), fill=RED)
        draw_cta_button(draw, 1740, "OTWÓRZ NA LEKCJI", t_sec, RED, delay=8.2)


# =============================================================================
# REEL 5 — AI Writing
# =============================================================================
def reel05(img, draw, t_sec, t):
    draw_animated_bg(img, t_sec, GREEN, BLUE)
    draw_particles(draw, t_sec, 5, GREEN)
    draw_top_bar(draw, t_sec)

    if t_sec < 5:
        draw_headline_anim(draw, t_sec, 190, "WRITING SUITE + AI", ["Pisanie z", "natychmiastowym feedbackiem"])
        items = [
            ("Boring → Brilliant", "Bogatsze słownictwo", BLUE),
            ("Detail Detective", "Rozwijaj zdania", RED),
            ("Frankenstein", "Struktura eseju", GREEN),
            ("Exam Simulator", "Email na egzamin", GOLD),
        ]
        for i, (title, sub, col) in enumerate(items):
            d = t_sec - 0.4 - i * 0.35
            if d <= 0:
                continue
            py = 520 + i * 130
            px = int(60 + (1 - ease_out_cubic(clamp(d / 0.5))) * 300)
            rounded_rect(draw, (px, py, W - 60, py + 100), GREY, radius=16, outline=col, width=3)
            draw_icon_pen(draw, px + 45, py + 50, 0.8)
            draw.text((px + 90, py + 22), title, font=font(26, True), fill=col)
            draw.text((px + 90, py + 58), sub, font=font(22), fill=MUTED)

    elif t_sec < 10:
        zoom = 0.92 + 0.08 * ease_in_out_quad(clamp((t_sec - 5) / 0.5))
        mx = int(W * (1 - zoom) / 2)
        my = int(200 * (1 - zoom) / 2)
        rounded_rect(draw, (60 + mx, 250 + my, W - 60 - mx, 1400 - my), WHITE, radius=28, outline=GREEN, width=5)
        draw.text((100, 300), "SYMULATOR EGZAMINU", font=font(40, True), fill=GREEN)
        draw.text((100, 370), "Napisz email — AI oceni jak egzaminator", font=font(26), fill=MUTED)
        rounded_rect(draw, (100, 450, W - 100, 900), GREY, radius=16, outline=BORDER)
        lines = ["Zadanie: Zaproś kolegę na piknik...", "• podaj miejsce i godzinę", "• zaproponuj co zabrać"]
        for i, line in enumerate(lines):
            vis = clamp((t_sec - 5.5 - i * 0.4) / 0.35)
            if vis <= 0:
                continue
            draw.text((130, 490 + i * 45), line, font=font(24 if i else 24, True), fill=BLUE if i == 0 else DARK)
        if t_sec > 7.5:
            draw_stamp(draw, W // 2, 1100, "OCENA: 5/5", "Wszystkie kryteria spełnione", clamp((t_sec - 7.5) / 0.45), GREEN)
            draw_sparkle_burst(draw, W // 2, 1100, clamp((t_sec - 7.5) / 0.55), 100, GOLD)

    else:
        draw_headline_anim(draw, t_sec, 320, "", ["Ćwicz w domu", "i na lekcji"], delay=10.0)
        draw.text((80, 500), "Writing Suite od 10 zł/tydz.", font=font(30), fill=MUTED)
        draw.text((80, 560), "Reszta platformy — FREE FOREVER", font=font(30, True), fill=GREEN)
        draw_cta_button(draw, 720, "LINGOSPARK.STUDY", t_sec, RED, delay=10.2)
        draw_cta_button(draw, 880, "Dołącz teraz", t_sec, BLUE, delay=10.5)


REELS = [
    ("fb-ig-01-angielski-bez-nudy", reel01, 0),
    ("fb-ig-02-wklej-slownictwo", reel02, 1),
    ("fb-ig-03-bomba-slownictwa", reel03, 2),
    ("fb-ig-04-klasa-tablica", reel04, 0),
    ("fb-ig-05-ai-pisanie", reel05, 1),
]


def main():
    print("LingoSpark FB/IG Reels v2 (PL, animated, no emojis)")
    for name, fn, variant in REELS:
        render_reel(name, fn, variant)
    print("\n[DONE] 5 reels re-rendered in shorts/")


if __name__ == "__main__":
    main()
