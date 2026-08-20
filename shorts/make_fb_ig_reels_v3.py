"""
LingoSpark — FB & IG Reels Pack (PL) v3
Six fresh creative angles, 13s each (under 15s limit), animated motion graphics + BGM.
Reuses the visual/audio helper library from make_fb_ig_reels.py.

Run:  python shorts/make_fb_ig_reels_v3.py
Docs: shorts/FB_IG_REELS_V3_PACK.txt
"""
from __future__ import annotations

import math

import make_fb_ig_reels as base
from make_fb_ig_reels import (
    BLUE, BLUE_DEEP, BLUE_LIGHT, BORDER, DARK, GOLD, GREEN, GREY, MUTED,
    OK_BG, RED, RED_LIGHT, WHITE, YELLOW_LIGHT,
    bounce_out, clamp, draw_accent_sweep, draw_card_slide, draw_cta_button,
    draw_headline_anim, draw_icon_badge, draw_icon_grid, draw_particles,
    draw_progress_bar, draw_sparkle_burst, draw_stamp, draw_top_bar,
    draw_typing_line, ease_in_out_quad, ease_out_cubic, font, rounded_rect, wrap,
)

# Keep every reel safely under the 15s platform sweet spot.
base.DURATION_SEC = 13.0
base.TOTAL_FRAMES = int(base.DURATION_SEC * base.FPS)

W, H = base.W, base.H


# ---------------------------------------------------------------------------
# Extra visual helpers for v3
# ---------------------------------------------------------------------------

def draw_big_counter(draw, cx, cy, value: int, suffix: str, pop: float, color=RED):
    """Large animated number that pops on each change."""
    scale = 1.0 + 0.12 * (1.0 - clamp(pop))
    f = font(int(140 * scale), True)
    text = f"{value}{suffix}"
    tw = draw.textbbox((0, 0), text, font=f)[2]
    draw.text((cx - tw / 2, cy - 90 * scale), text, font=f, fill=color)


def draw_tick(draw, cx, cy, r, progress: float, color=GREEN):
    """Circle with an animated check mark."""
    p = ease_out_cubic(clamp(progress))
    if p <= 0:
        return
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)
    pts = [(cx - r * 0.45, cy), (cx - r * 0.1, cy + r * 0.38), (cx + r * 0.5, cy - r * 0.35)]
    if p < 0.6:
        end = (
            pts[0][0] + (pts[1][0] - pts[0][0]) * (p / 0.6),
            pts[0][1] + (pts[1][1] - pts[0][1]) * (p / 0.6),
        )
        draw.line([pts[0], end], fill=WHITE, width=max(3, int(r * 0.22)))
    else:
        q = (p - 0.6) / 0.4
        end = (
            pts[1][0] + (pts[2][0] - pts[1][0]) * q,
            pts[1][1] + (pts[2][1] - pts[1][1]) * q,
        )
        draw.line([pts[0], pts[1]], fill=WHITE, width=max(3, int(r * 0.22)))
        draw.line([pts[1], end], fill=WHITE, width=max(3, int(r * 0.22)))


def draw_cross(draw, cx, cy, r, progress: float, color=RED):
    p = ease_out_cubic(clamp(progress))
    if p <= 0:
        return
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)
    a = r * 0.45 * p
    draw.line((cx - a, cy - a, cx + a, cy + a), fill=WHITE, width=max(3, int(r * 0.2)))
    draw.line((cx - a, cy + a, cx + a, cy - a), fill=WHITE, width=max(3, int(r * 0.2)))


def draw_chart_bars(draw, x, y, w, h, values, progress: float, color=BLUE):
    """Animated bar chart growing from the baseline."""
    n = len(values)
    gap = 18
    bw = (w - gap * (n - 1)) / n
    for g in range(1, 4):
        gy = y + h * g / 4
        draw.line((x, gy, x + w, gy), fill=BORDER, width=2)
    draw.line((x, y + h, x + w, y + h), fill=MUTED, width=3)
    for i, v in enumerate(values):
        p = ease_out_cubic(clamp((progress - i * 0.08) / 0.5))
        bh = h * v * p
        bx = x + i * (bw + gap)
        rounded_rect(draw, (bx, y + h - bh, bx + bw, y + h), color if i % 2 == 0 else GOLD, radius=10)


def draw_word_row(draw, x, y, w, term: str, pct: float, progress: float, color=GREEN):
    p = ease_out_cubic(clamp(progress))
    if p <= 0:
        return
    ox = int((1 - p) * -300)
    rounded_rect(draw, (x + ox, y, x + w + ox, y + 108), WHITE, radius=16, outline=BORDER, width=2)
    draw.text((x + 28 + ox, y + 20), term, font=font(30, True), fill=BLUE)
    draw_progress_bar(draw, x + 28 + ox, y + 70, w - 160, pct * p, color)
    draw.text((x + w - 110 + ox, y + 58), f"{int(pct * 100 * p)}%", font=font(26, True), fill=color)


def draw_strike_text(draw, x, y, text, f, progress: float, color=RED):
    """Text with an animated strike-through (for before/after reveals)."""
    draw.text((x, y), text, font=f, fill=MUTED)
    tw = draw.textbbox((0, 0), text, font=f)[2]
    th = draw.textbbox((0, 0), text, font=f)[3]
    sw = int(tw * ease_out_cubic(clamp(progress)))
    if sw > 0:
        draw.line((x, y + th * 0.6, x + sw, y + th * 0.6), fill=color, width=5)


def draw_tile_letter(draw, x, y, size, letter: str, state: str, flip: float):
    """Wordle-style tile that flips into a coloured state."""
    p = clamp(flip)
    squash = abs(math.cos(p * math.pi))
    hh = max(6, size * squash / 2)
    revealed = p > 0.5
    fill = WHITE
    outline = BORDER
    txt = BLUE
    if revealed:
        if state == "hit":
            fill, outline, txt = GREEN, GREEN, WHITE
        elif state == "near":
            fill, outline, txt = GOLD, GOLD, WHITE
        else:
            fill, outline, txt = GREY, BORDER, MUTED
    rounded_rect(draw, (x, y + size / 2 - hh, x + size, y + size / 2 + hh), fill, radius=10, outline=outline, width=3)
    if squash > 0.45:
        f = font(int(size * 0.5), True)
        tw = draw.textbbox((0, 0), letter, font=f)[2]
        draw.text((x + size / 2 - tw / 2, y + size / 2 - size * 0.28), letter, font=f, fill=txt)


def draw_price_column(draw, x, y, w, h, title, price, items, color, bg, t_sec, delay):
    p = ease_out_cubic(clamp((t_sec - delay) / 0.55))
    if p <= 0:
        return
    oy = int((1 - p) * 120)
    rounded_rect(draw, (x, y + oy, x + w, y + h + oy), bg, radius=24, outline=color, width=5)
    draw.text((x + 30, y + 30 + oy), title, font=font(34, True), fill=color)
    draw.text((x + 30, y + 82 + oy), price, font=font(44, True), fill=BLUE)
    for i, item in enumerate(items):
        ip = clamp((t_sec - delay - 0.4 - i * 0.22) / 0.4)
        if ip <= 0:
            continue
        iy = y + 165 + i * 78 + oy
        draw_tick(draw, x + 55, iy + 22, 22, ip, color)
        for j, line in enumerate(wrap(item, 20)):
            draw.text((x + 92, iy + 2 + j * 30), line, font=font(24, True), fill=DARK)


def draw_scene_wipe(draw, t_sec, at: float, color=BLUE):
    """Quick diagonal wipe used between acts."""
    p = clamp((t_sec - at) / 0.35)
    if p <= 0 or p >= 1:
        return
    if p < 0.5:
        w = int(W * 2 * (p / 0.5))
        draw.polygon([(0, 0), (w, 0), (w - 260, H), (0, H)], fill=color)
    else:
        q = (p - 0.5) / 0.5
        x0 = int(W * 2 * q)
        draw.polygon([(x0, 0), (W * 2, 0), (W * 2, H), (x0 - 260, H)], fill=color)


# =============================================================================
# REEL 1 — Gotowa lekcja w 30 sekund (teacher pain -> speed)
# =============================================================================
def reel_lesson_in_30s(img, draw, t_sec, t):
    base.draw_animated_bg(img, t_sec, BLUE, GOLD)
    draw_particles(draw, t_sec, 1, GOLD)
    draw_top_bar(draw, t_sec, slide_in=clamp(t_sec / 0.5))

    if t_sec < 4.4:
        draw_accent_sweep(draw, t_sec, 175, RED)
        draw_headline_anim(draw, t_sec, 210, "DLA NAUCZYCIELA", ["Nie masz czasu", "na przygotowania?"])
        secs = max(0, 30 - int(t_sec * 8))
        pop = (t_sec * 8) % 1.0
        rounded_rect(draw, (140, 700, W - 140, 1080), WHITE, radius=28, outline=RED, width=6)
        draw_big_counter(draw, W // 2, 900, secs, "s", pop, RED)
        draw.text((260, 980), "tyle wystarczy na start", font=font(30, True), fill=MUTED)
        if t_sec > 2.4:
            draw_stamp(draw, W // 2, 1350, "ZERO DRUKOWANIA", "Zero kopiowania kart pracy",
                       clamp((t_sec - 2.4) / 0.5), BLUE)

    elif t_sec < 9.2:
        draw_scene_wipe(draw, t_sec, 4.4, BLUE)
        draw_headline_anim(draw, t_sec, 200, "TRZY KROKI", ["Wklej. Wybierz.", "Uczniowie grają."], delay=4.5)
        steps = [
            ("Wklej listę słówek", "Dowolny glossary z lekcji", BLUE),
            ("Wybierz grę", "Fiszki, bomba, grid, aukcja", RED),
            ("Uczniowie grają", "Sami, w parach lub całą klasą", GREEN),
        ]
        for i, (title, sub, col) in enumerate(steps):
            sy = 480 + i * 300
            ok = draw_card_slide(draw, (60, sy, W - 60, sy + 250), WHITE, col, t_sec, 4.7 + i * 0.32,
                                 from_left=(i % 2 == 0))
            if ok:
                tick_p = clamp((t_sec - 5.2 - i * 0.32) / 0.55)
                draw_tick(draw, 140, sy + 125, 48, tick_p, col)
                draw.text((220, sy + 55), title, font=font(38, True), fill=col)
                draw.text((220, sy + 112), sub, font=font(26), fill=MUTED)
                uw = int((W - 300) * ease_out_cubic(clamp((t_sec - 5.4 - i * 0.32) / 0.6)))
                draw.line((220, sy + 190, 220 + uw, sy + 190), fill=col, width=4)

    else:
        draw_scene_wipe(draw, t_sec, 9.2, RED)
        p = bounce_out(clamp((t_sec - 9.3) / 0.6))
        cw, ch = int(940 * p), int(900 * p)
        cx, cy = W // 2, 900
        rounded_rect(draw, (cx - cw // 2, cy - ch // 2, cx + cw // 2, cy + ch // 2), WHITE, radius=32,
                     outline=BLUE, width=6)
        draw.text((cx - 380, cy - ch // 2 + 70), "LEKCJA GOTOWA", font=font(36, True), fill=RED)
        draw.text((cx - 380, cy - ch // 2 + 130), "lingospark.study", font=font(56, True), fill=BLUE)
        for i, line in enumerate(wrap("Gry słownictwa bez rejestracji i bez opłat.", 24)):
            draw.text((cx - 380, cy - ch // 2 + 250 + i * 44), line, font=font(30), fill=DARK)
        draw_sparkle_burst(draw, cx, cy + 60, clamp((t_sec - 10.2) / 0.7), 130, GOLD)
        draw_cta_button(draw, 1420, "OTWÓRZ NA LEKCJI", t_sec, RED, delay=9.6)


# =============================================================================
# REEL 2 — Nudne zdanie -> Brilliant (before / after)
# =============================================================================
def reel_boring_to_brilliant(img, draw, t_sec, t):
    base.draw_animated_bg(img, t_sec, GOLD, GREEN)
    draw_particles(draw, t_sec, 2, GOLD)
    draw_top_bar(draw, t_sec)

    draw_headline_anim(draw, t_sec, 195, "PRIMARY ENGLISH", ["Z nudnego", "na genialne"])

    # BEFORE panel
    rounded_rect(draw, (60, 430, W - 60, 800), WHITE, radius=24, outline=RED, width=5)
    draw.text((100, 460), "PRZED", font=font(28, True), fill=RED)
    f_sent = font(38, True)
    strike_p = clamp((t_sec - 1.6) / 0.9)
    draw.text((100, 530), "The dog was", font=f_sent, fill=DARK)
    draw_strike_text(draw, 100, 600, "nice and the park was big.", f_sent, strike_p, RED)
    if t_sec > 1.0:
        draw_cross(draw, W - 150, 500, 34, clamp((t_sec - 1.0) / 0.4), RED)
    draw.text((100, 700), "Dwa przeciętne słowa", font=font(26), fill=MUTED)

    # Transition arrow
    if t_sec > 3.0:
        ap = ease_in_out_quad(clamp((t_sec - 3.0) / 0.5))
        ay = int(830 + 20 * math.sin(t_sec * 5))
        draw.polygon([(W // 2 - 40 * ap, ay), (W // 2 + 40 * ap, ay), (W // 2, ay + 55 * ap)], fill=BLUE)

    # AFTER panel
    if t_sec > 4.0:
        p = bounce_out(clamp((t_sec - 4.0) / 0.6))
        top = int(940 + (1 - p) * 200)
        rounded_rect(draw, (60, top, W - 60, top + 380), OK_BG, radius=24, outline=GREEN, width=5)
        draw.text((100, top + 30), "PO", font=font(28, True), fill=GREEN)
        draw.text((100, top + 100), "The dog was", font=f_sent, fill=DARK)
        reveal = clamp((t_sec - 4.8) / 1.2)
        after = "delightful and the park was vast."
        draw.text((100, top + 170), after[: int(len(after) * reveal)], font=f_sent, fill=GREEN)
        draw.text((100, top + 270), "Ten sam sens, bogatsze słowa", font=font(26), fill=MUTED)
        draw_sparkle_burst(draw, W // 2, top + 190, clamp((t_sec - 5.6) / 0.7), 120, GOLD)

    if t_sec > 7.2:
        draw_stamp(draw, W // 2, 1480, "BRILLIANT  +20 PKT", "AI sprawdza sens i poziom",
                   clamp((t_sec - 7.2) / 0.5), GREEN)

    if t_sec > 9.2:
        draw.text((80, 1620), "Poziomy A1 · A2 · B1 albo własna lista", font=font(28, True), fill=BLUE)
        draw_cta_button(draw, 1700, "SPRÓBUJ TERAZ", t_sec, GREEN, delay=9.4)


# =============================================================================
# REEL 3 — Pojedynek na słówka (Grid Territory)
# =============================================================================
def reel_grid_duel(img, draw, t_sec, t):
    base.draw_animated_bg(img, t_sec, BLUE, RED)
    draw_particles(draw, t_sec, 3, BLUE)
    draw_top_bar(draw, t_sec)

    draw_headline_anim(draw, t_sec, 195, "GRID TERRITORY", ["Pojedynek", "na słówka"])

    # Score bar
    rounded_rect(draw, (60, 420, 520, 520), BLUE_LIGHT, radius=18, outline=BLUE, width=3)
    rounded_rect(draw, (W - 520, 420, W - 60, 520), RED_LIGHT, radius=18, outline=RED, width=3)
    claims_x = min(3, max(0, int((t_sec - 2.0) / 1.6)))
    claims_o = min(2, max(0, int((t_sec - 3.0) / 2.2)))
    draw.text((100, 448), f"Zespół 1:  {claims_x}", font=font(32, True), fill=BLUE)
    draw.text((W - 480, 448), f"Zespół 2:  {claims_o}", font=font(32, True), fill=RED)

    # Board
    board_x, board_y, cell = 150, 580, 250
    order = [(0, "X", 2.0), (4, "O", 3.0), (1, "X", 3.6), (8, "O", 5.2), (2, "X", 6.4)]
    for idx in range(9):
        cx = board_x + (idx % 3) * (cell + 12)
        cy = board_y + (idx // 3) * (cell + 12)
        rounded_rect(draw, (cx, cy, cx + cell, cy + cell), WHITE, radius=16, outline=BORDER, width=3)
    for idx, mark, at in order:
        p = bounce_out(clamp((t_sec - at) / 0.45))
        if p <= 0:
            continue
        cx = board_x + (idx % 3) * (cell + 12)
        cy = board_y + (idx // 3) * (cell + 12)
        col = BLUE if mark == "X" else RED
        bg = BLUE_LIGHT if mark == "X" else RED_LIGHT
        pad = (1 - p) * cell / 2
        rounded_rect(draw, (cx + pad, cy + pad, cx + cell - pad, cy + cell - pad), bg, radius=16, outline=col, width=4)
        f = font(int(120 * p), True)
        tw = draw.textbbox((0, 0), mark, font=f)[2]
        draw.text((cx + cell / 2 - tw / 2, cy + cell / 2 - 75 * p), mark, font=f, fill=col)

    # Question popup mid-reel
    if 4.0 < t_sec < 6.2:
        p = ease_out_cubic(clamp((t_sec - 4.0) / 0.35))
        top = int(1420 - 40 * p)
        rounded_rect(draw, (80, top, W - 80, top + 300), WHITE, radius=22, outline=BLUE, width=5)
        draw.text((120, top + 30), "Zdobądź pole — odpowiedz poprawnie", font=font(26, True), fill=RED)
        draw.text((120, top + 80), "Definicja: bardzo szybki", font=font(30), fill=DARK)
        draw_typing_line(draw, 120, top + 150, W - 240, "SWIFT", t_sec, 4.6, cps=8)

    if 6.2 <= t_sec < 8.4:
        draw_stamp(draw, W // 2, 1560, "POLE ZDOBYTE", "Tura przechodzi dalej",
                   clamp((t_sec - 6.2) / 0.45), GREEN)

    if t_sec > 8.6:
        rounded_rect(draw, (60, 1480, W - 60, 1620), YELLOW_LIGHT, radius=20, outline=GOLD, width=4)
        draw.text((100, 1520), "Solo z botem albo dwa zespoły", font=font(30, True), fill=DARK)
        draw_cta_button(draw, 1660, "ZAGRAJ ZA DARMO", t_sec, BLUE, delay=8.8)


# =============================================================================
# REEL 4 — Cała klasa gra naraz (Team Challenge)
# =============================================================================
def reel_whole_class(img, draw, t_sec, t):
    base.draw_animated_bg(img, t_sec, RED, GOLD)
    draw_particles(draw, t_sec, 4, RED)
    draw_top_bar(draw, t_sec)

    draw_headline_anim(draw, t_sec, 195, "TEAM CHALLENGE", ["Cała klasa", "gra naraz"])

    # Wordle-style board with flipping tiles
    word = [("S", "hit"), ("W", "near"), ("I", "miss"), ("F", "hit"), ("T", "hit")]
    size, gap = 170, 18
    total_w = len(word) * size + (len(word) - 1) * gap
    bx = (W - total_w) // 2
    by = 470
    for i, (letter, state) in enumerate(word):
        flip = clamp((t_sec - 1.0 - i * 0.28) / 0.5)
        draw_tile_letter(draw, bx + i * (size + gap), by, size, letter, state, flip)

    if t_sec > 3.2:
        draw.text((100, 700), "Kolory podpowiadają, co już wiesz", font=font(28, True), fill=DARK)

    # Team scoreboard counting up
    if t_sec > 4.0:
        teams = [("Zespół A", 0.85, BLUE), ("Zespół B", 0.62, RED), ("Zespół C", 0.44, GREEN)]
        for i, (name, val, col) in enumerate(teams):
            ty = 790 + i * 150
            p = ease_out_cubic(clamp((t_sec - 4.0 - i * 0.25) / 0.6))
            if p <= 0:
                continue
            rounded_rect(draw, (80, ty, W - 80, ty + 120), WHITE, radius=18, outline=col, width=4)
            draw_icon_badge(draw, 145, ty + 60, 34, name[-1], col, t_sec + i)
            draw.text((210, ty + 22), name, font=font(30, True), fill=col)
            draw_progress_bar(draw, 210, ty + 72, W - 420, val * p, col)
            draw.text((W - 190, ty + 40), f"{int(val * 100 * p)}", font=font(34, True), fill=col)

    # Games strip
    if t_sec > 6.3:
        games = ["Wordle", "Scramble", "Word Chain", "Quintagrams"]
        for i, g in enumerate(games):
            gp = bounce_out(clamp((t_sec - 6.3 - i * 0.18) / 0.4))
            if gp <= 0:
                continue
            gx = 80 + (i % 2) * 470
            gy = 1290 + (i // 2) * 130
            gw = int(440 * gp)
            rounded_rect(draw, (gx, gy, gx + gw, gy + 105), RED_LIGHT, radius=18, outline=RED, width=3)
            draw.text((gx + 30, gy + 34), g, font=font(30, True), fill=RED)

    if t_sec > 9.6:
        draw.text((80, 1590), "Vocab i Team Challenge — FREE FOREVER", font=font(28, True), fill=GREEN)
        draw_cta_button(draw, 1670, "WŁĄCZ NA PROJEKTORZE", t_sec, RED, delay=9.8)


# =============================================================================
# REEL 5 — Zapisz swój postęp (accounts / word sets — new feature)
# =============================================================================
def reel_save_progress(img, draw, t_sec, t):
    base.draw_animated_bg(img, t_sec, GREEN, BLUE)
    draw_particles(draw, t_sec, 5, GREEN)
    draw_top_bar(draw, t_sec)

    if t_sec < 4.6:
        draw_headline_anim(draw, t_sec, 200, "NOWOŚĆ", ["Twoje zestawy", "i postęp — zapisane"])
        rows = [("massive", 1.0, 1.2), ("swift", 0.75, 1.6), ("ancient", 0.5, 2.0), ("brilliant", 0.3, 2.4)]
        for i, (term, pct, at) in enumerate(rows):
            draw_word_row(draw, 70, 620 + i * 130, W - 140, term, pct, clamp((t_sec - at) / 0.6))
        if t_sec > 3.2:
            draw_stamp(draw, W // 2, 1300, "ZAPISANE NA KONCIE", "Wracasz i kontynuujesz",
                       clamp((t_sec - 3.2) / 0.5), GREEN)

    elif t_sec < 9.4:
        draw_scene_wipe(draw, t_sec, 4.6, GREEN)
        draw_headline_anim(draw, t_sec, 200, "MÓJ POSTĘP", ["Widzisz, ile", "naprawdę umiesz"], delay=4.7)
        rounded_rect(draw, (60, 470, W - 60, 1080), WHITE, radius=26, outline=BLUE, width=5)
        draw.text((100, 505), "Sesje w ostatnich dniach", font=font(28, True), fill=MUTED)
        draw_chart_bars(draw, 110, 570, W - 220, 420, [0.35, 0.55, 0.4, 0.75, 0.6, 0.9, 0.8],
                        clamp((t_sec - 4.85) / 1.1), BLUE)
        tiles = [("Opanowane słowa", "128", GREEN), ("Rozegrane gry", "43", BLUE), ("Zestawy", "6", GOLD)]
        for i, (label, value, col) in enumerate(tiles):
            p = bounce_out(clamp((t_sec - 5.9 - i * 0.22) / 0.45))
            if p <= 0:
                continue
            tx = 70 + i * 320
            tw_ = int(300 * p)
            rounded_rect(draw, (tx, 1140, tx + tw_, 1400), WHITE, radius=22, outline=col, width=4)
            vf = font(56, True)
            vw = draw.textbbox((0, 0), value, font=vf)[2]
            draw.text((tx + tw_ / 2 - vw / 2, 1195), value, font=vf, fill=col)
            for j, line in enumerate(wrap(label, 13)):
                draw.text((tx + 24, 1285 + j * 32), line, font=font(24, True), fill=MUTED)
        if t_sec > 7.0:
            fp = bounce_out(clamp((t_sec - 7.0) / 0.5))
            fw = int(940 * fp)
            rounded_rect(draw, ((W - fw) // 2, 1470, (W + fw) // 2, 1620), YELLOW_LIGHT, radius=22,
                         outline=GOLD, width=4)
            draw.text((W // 2 - 380, 1500), "Postęp liczy się w każdej grze", font=font(30, True), fill=DARK)
            draw.text((W // 2 - 380, 1548), "Fiszki, bomba, grid, aukcja, pisanie", font=font(26), fill=MUTED)
            draw_accent_sweep(draw, t_sec, 1680, GREEN)

    else:
        draw_scene_wipe(draw, t_sec, 9.4, BLUE)
        p = bounce_out(clamp((t_sec - 9.5) / 0.6))
        cw, ch = int(940 * p), int(860 * p)
        cx, cy = W // 2, 920
        rounded_rect(draw, (cx - cw // 2, cy - ch // 2, cx + cw // 2, cy + ch // 2), WHITE, radius=32,
                     outline=GREEN, width=6)
        draw.text((cx - 380, cy - ch // 2 + 70), "KONTO ZA DARMO", font=font(36, True), fill=GREEN)
        draw.text((cx - 380, cy - ch // 2 + 130), "lingospark.study", font=font(54, True), fill=BLUE)
        for i, line in enumerate(wrap("Zapisuj listy słówek i śledź postęp we wszystkich grach.", 24)):
            draw.text((cx - 380, cy - ch // 2 + 250 + i * 44), line, font=font(30), fill=DARK)
        draw_sparkle_burst(draw, cx, cy + 70, clamp((t_sec - 10.4) / 0.7), 120, GOLD)
        draw_cta_button(draw, 1440, "ZAŁÓŻ KONTO", t_sec, GREEN, delay=9.8)


# =============================================================================
# REEL 6 — Co jest darmowe (pricing clarity)
# =============================================================================
def reel_free_vs_ai(img, draw, t_sec, t):
    base.draw_animated_bg(img, t_sec, GREEN, RED)
    draw_particles(draw, t_sec, 6, GOLD)
    draw_top_bar(draw, t_sec)

    draw_headline_anim(draw, t_sec, 195, "JASNE ZASADY", ["Co dostajesz", "za darmo?"])

    draw_price_column(
        draw, 60, 440, (W - 180) // 2, 780,
        "ZA DARMO", "0 zł",
        ["Gry słownictwa", "Gry dla klasy", "Konto i zestawy", "Śledzenie postępu"],
        GREEN, OK_BG, t_sec, 0.8,
    )
    draw_price_column(
        draw, W // 2 + 30, 440, (W - 180) // 2, 780,
        "AI WRITING", "od 10 zł / tydz.",
        ["Writing Suite z AI", "Primary English", "Symulator egzaminu", "Feedback od AI"],
        RED, RED_LIGHT, t_sec, 1.3,
    )

    if t_sec > 6.4:
        p = bounce_out(clamp((t_sec - 6.4) / 0.55))
        bw = int(940 * p)
        rounded_rect(draw, ((W - bw) // 2, 1300, (W + bw) // 2, 1470), YELLOW_LIGHT, radius=24,
                     outline=GOLD, width=5)
        draw.text((W // 2 - 300, 1330), "Vocab i klasa zostają", font=font(30, True), fill=DARK)
        draw.text((W // 2 - 300, 1380), "FREE FOREVER", font=font(46, True), fill=GREEN)
        draw_sparkle_burst(draw, W // 2, 1385, clamp((t_sec - 7.0) / 0.7), 130, GOLD)

    if t_sec > 8.8:
        draw.text((80, 1540), "Bez rejestracji możesz zagrać od razu", font=font(28, True), fill=MUTED)
        draw_cta_button(draw, 1620, "SPRAWDŹ LINGOSPARK", t_sec, GREEN, delay=9.0)


REELS = [
    ("fbig-v3-01-lekcja-w-30-sekund", reel_lesson_in_30s, 0),
    ("fbig-v3-02-nudne-na-genialne", reel_boring_to_brilliant, 1),
    ("fbig-v3-03-pojedynek-na-slowka", reel_grid_duel, 2),
    ("fbig-v3-04-cala-klasa-gra", reel_whole_class, 0),
    ("fbig-v3-05-zapisz-postep", reel_save_progress, 1),
    ("fbig-v3-06-co-jest-darmowe", reel_free_vs_ai, 2),
]


def main():
    import sys

    picked = [int(a) for a in sys.argv[1:] if a.isdigit()]
    todo = [REELS[i - 1] for i in picked] if picked else REELS
    print(f"LingoSpark FB/IG Reels v3 — {len(todo)} reels, {base.DURATION_SEC:.0f}s each")
    for name, fn, variant in todo:
        base.render_reel(name, fn, variant)
    print("\n[DONE] v3 reels in shorts/ — captions in FB_IG_REELS_V3_PACK.txt")


if __name__ == "__main__":
    main()
