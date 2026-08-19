"""
LingoSpark Promotional Shorts Generator (1080x1920, 9:16 vertical, 30 fps, ~12 sec each)
Generates 4 dynamic, visually exciting, eye-catching promo videos in ENGLISH adhering strictly
to LingoSpark design system, palette, typography and branding (NO VO audio track).
Adds rich icons to all cards, squares, badges, buttons, and structural blocks.
"""
from __future__ import annotations

import math
import os
import subprocess
import textwrap
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
FFMPEG = Path(
    r"C:\Users\karol\AppData\Local\Microsoft\WinGet\Packages"
    r"\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe"
    r"\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"
)

W, H = 1080, 1920
FPS = 30

# LingoSpark Palette
BLUE = (1, 33, 105)        # --royal-blue #012169
RED = (200, 16, 46)        # --pillarbox-red #C8102E
GREEN = (0, 130, 59)       # --success-green #00823B
GOLD = (245, 166, 35)      # Accent Gold #F5A623
WHITE = (255, 255, 255)
GREY = (244, 245, 247)      # --light-grey #F4F5F7
DARK = (45, 45, 45)        # --text-dark #2D2D2D
MUTED = (90, 90, 90)       # --text-muted #5A5A5A
BORDER = (224, 224, 224)    # --border-light #E0E0E0
OK_BG = (232, 245, 233)
BLUE_LIGHT = (235, 242, 255)
YELLOW_LIGHT = (255, 248, 225)


# --- Fonts & Helpers ---
def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    paths = [
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\calibrib.ttf" if bold else r"C:\Windows\Fonts\calibri.ttf",
    ]
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def clamp(v: float, mn: float = 0.0, mx: float = 1.0) -> float:
    return max(mn, min(mx, v))


def ease_out_cubic(t: float) -> float:
    t = clamp(t)
    return 1 - (1 - t) ** 3


def ease_in_out_quad(t: float) -> float:
    t = clamp(t)
    return 2 * t * t if t < 0.5 else 1 - (-2 * t + 2) ** 2 / 2


def bounce_out(t: float) -> float:
    t = clamp(t)
    n1 = 7.5625
    d1 = 2.75
    if t < 1 / d1:
        return n1 * t * t
    elif t < 2 / d1:
        t -= 1.5 / d1
        return n1 * t * t + 0.75
    elif t < 2.5 / d1:
        t -= 2.25 / d1
        return n1 * t * t + 0.9375
    else:
        t -= 2.625 / d1
        return n1 * t * t + 0.984375


def rounded_rect(draw: ImageDraw.ImageDraw, box, fill, radius=16, outline=None, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def wrap(text: str, width: int = 32) -> list[str]:
    return textwrap.wrap(text, width=width) or [""]


def draw_top_bar(draw: ImageDraw.ImageDraw):
    # Header container
    rounded_rect(draw, (48, 50, W - 48, 160), WHITE, radius=18, outline=BORDER, width=2)
    # LingoSpark logo mark
    draw.text((80, 80), "Lingo", font=font(44, True), fill=BLUE)
    draw.text((215, 80), "Spark", font=font(44, True), fill=RED)
    
    # URL Pill Badge
    rounded_rect(draw, (W - 380, 78, W - 80, 132), BLUE_LIGHT, radius=20, outline=BLUE, width=2)
    draw.text((W - 355, 90), "lingospark.study", font=font(24, True), fill=BLUE)


def draw_sparkle_burst(draw: ImageDraw.ImageDraw, cx: float, cy: float, progress: float, radius: float = 80.0, color=GOLD):
    if progress <= 0 or progress >= 1:
        return
    num_particles = 8
    p_rad = radius * ease_out_cubic(progress)
    alpha_scale = 1.0 - progress
    
    for i in range(num_particles):
        angle = (2 * math.pi / num_particles) * i + progress * 0.5
        px = cx + math.cos(angle) * p_rad
        py = cy + math.sin(angle) * p_rad
        size = int(10 * alpha_scale)
        if size > 1:
            draw.ellipse((px - size, py - size, px + size, py + size), fill=color)


def draw_stamp(draw: ImageDraw.ImageDraw, cx: float, cy: float, text: str, subtext: str = "", progress: float = 1.0, color=GREEN):
    if progress <= 0:
        return
    scale = 1.0 + (1.0 - ease_out_cubic(progress)) * 0.8
    
    w, h = 420, 150
    x1 = cx - (w / 2) * scale
    y1 = cy - (h / 2) * scale
    x2 = cx + (w / 2) * scale
    y2 = cy + (h / 2) * scale
    
    rounded_rect(draw, (x1, y1, x2, y2), WHITE, radius=18, outline=color, width=int(6 * scale))
    
    f1 = font(int(36 * scale), True)
    bbox1 = draw.textbbox((0, 0), text, font=f1)
    tw1 = bbox1[2] - bbox1[0]
    draw.text((cx - tw1 / 2, y1 + 25 * scale), text, font=f1, fill=color)
    
    if subtext:
        f2 = font(int(24 * scale), True)
        bbox2 = draw.textbbox((0, 0), subtext, font=f2)
        tw2 = bbox2[2] - bbox2[0]
        draw.text((cx - tw2 / 2, y1 + 80 * scale), subtext, font=f2, fill=MUTED)


def create_promo_video(name: str, render_frame_func, total_frames: int = 360) -> Path:
    frames_dir = ROOT / f"frames_{name}"
    frames_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Generating {total_frames} frames for {name}...")
    for frame_idx in range(total_frames):
        t = frame_idx / total_frames
        t_sec = frame_idx / FPS
        
        img = Image.new("RGB", (W, H), GREY)
        draw = ImageDraw.Draw(img)
        
        render_frame_func(draw, img, frame_idx, t, t_sec)
        
        frame_path = frames_dir / f"frame_{frame_idx:04d}.png"
        img.save(frame_path, "PNG")
        
    out_mp4 = ROOT / f"{name}.mp4"
    cmd_ffmpeg = [
        str(FFMPEG), "-y",
        "-framerate", str(FPS),
        "-i", str(frames_dir / "frame_%04d.png"),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-r", str(FPS),
        str(out_mp4)
    ]
    subprocess.run(cmd_ffmpeg, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"[OK] Rendered promo short: {out_mp4.name}")
    return out_mp4


# ==============================================================================
# PROMO 1: PLATFORM OVERVIEW (ALL-IN-ONE ESL HUB)
# ==============================================================================
def render_promo_overview(draw: ImageDraw.ImageDraw, img: Image.Image, f_idx: int, t: float, t_sec: float):
    draw_top_bar(draw)
    
    if t_sec < 3.0:
        # Phase 1: High Energy Hook Title
        p_intro = clamp(t_sec / 1.0)
        e_intro = ease_out_cubic(p_intro)
        
        y_title = int(220 + (1.0 - e_intro) * 150)
        draw.text((70, y_title), "ESL LEARNING REDEFINED", font=font(32, True), fill=RED)
        
        # Giant Main Title in English
        draw.text((70, y_title + 50), "Learn English", font=font(58, True), fill=BLUE)
        draw.text((70, y_title + 125), "Without Boredom!", font=font(58, True), fill=RED)
        
        # Big Feature Card
        card_y = int(480 + (1.0 - e_intro) * 250)
        rounded_rect(draw, (60, card_y, W - 60, card_y + 900), WHITE, radius=28, outline=BLUE, width=4)
        
        # 3 Bullet Badges inside with rich icons
        badge_y = card_y + 80
        badges = [
            ("⚡ 100% Free Vocabulary Tools", BLUE, BLUE_LIGHT),
            ("🎮 Interactive Word & Board Games", RED, (255, 235, 238)),
            ("🤖 AI Writing & Essay Suite", GREEN, OK_BG)
        ]
        for idx, (txt, c_text, c_bg) in enumerate(badges):
            b_delay = clamp((t_sec - 0.5 - idx * 0.4) / 0.6)
            if b_delay > 0:
                e_b = bounce_out(b_delay)
                bx = int(90 + (1.0 - e_b) * -200)
                by = badge_y + idx * 220
                rounded_rect(draw, (bx, by, W - 120, by + 160), c_bg, radius=20, outline=c_text, width=3)
                draw.text((bx + 40, by + 50), txt, font=font(34, True), fill=c_text)

    elif t_sec < 6.0:
        # Phase 2: 3 Interactive Hub Squares (Vocab, Team, Writing)
        draw.text((70, 200), "CHOOSE YOUR MODE:", font=font(32, True), fill=RED)
        draw.text((70, 250), "3 Core LingoSpark Sections", font=font(52, True), fill=BLUE)
        
        hubs = [
            ("Vocab Review", "Flashcards, Bomb, Grid, Auction — 100% Free", BLUE, "📘", 340),
            ("Team Challenge", "Classroom board games for big screens", RED, "👥", 780),
            ("Writing Suite", "AI essays, structure & primary prep", GREEN, "✍️", 1220)
        ]
        
        for idx, (title, sub, color, icon, target_y) in enumerate(hubs):
            h_delay = clamp((t_sec - 3.0 - idx * 0.25) / 0.6)
            if h_delay > 0:
                e_h = ease_out_cubic(h_delay)
                box_x = int(60 + (1.0 - e_h) * (400 if idx % 2 == 0 else -400))
                box_y = target_y
                
                is_hover = (3.0 + idx * 0.8) <= t_sec <= (3.8 + idx * 0.8)
                b_color = GOLD if is_hover else color
                bg_color = YELLOW_LIGHT if is_hover else WHITE
                
                rounded_rect(draw, (box_x, box_y, W - 60, box_y + 380), bg_color, radius=24, outline=b_color, width=4 if is_hover else 3)
                
                # Icon circle
                draw.ellipse((box_x + 50, box_y + 50, box_x + 190, box_y + 190), fill=b_color)
                draw.text((box_x + 95, box_y + 90), icon, font=font(52))
                
                draw.text((box_x + 230, box_y + 70), title, font=font(44, True), fill=BLUE)
                lines = wrap(sub, 26)
                for i_l, line in enumerate(lines):
                    draw.text((box_x + 230, box_y + 130 + i_l * 38), line, font=font(28), fill=MUTED)
                
                # Play button pill
                rounded_rect(draw, (box_x + 230, box_y + 260, box_x + 520, box_y + 330), b_color, radius=20)
                draw.text((box_x + 270, box_y + 280), "Open Section ➔", font=font(26, True), fill=WHITE)

    elif t_sec < 9.0:
        # Phase 3: Fast Multi-Game Showcase
        draw.text((70, 200), "OVER 15 INTERACTIVE GAMES!", font=font(30, True), fill=RED)
        draw.text((70, 245), "Explore Full Possibilities", font=font(52, True), fill=BLUE)
        
        # Card 1: Bomb Defusal
        rounded_rect(draw, (60, 330, W - 60, 720), WHITE, radius=24, outline=RED, width=4)
        draw.text((100, 370), "💣 Vocabulary Bomb Defusal", font=font(40, True), fill=RED)
        draw.text((100, 430), "Fast typing under ticking timer pressure!", font=font(28), fill=DARK)
        
        time_left = int(60 - (t_sec - 6.0) * 15)
        rounded_rect(draw, (100, 500, 340, 620), RED, radius=18)
        draw.text((140, 530), f"⏱️ {time_left}s", font=font(44, True), fill=WHITE)
        
        rounded_rect(draw, (380, 500, W - 100, 620), OK_BG, radius=18, outline=GREEN, width=3)
        draw.text((410, 540), "⚡ +5s TIME BONUS!", font=font(32, True), fill=GREEN)
        
        # Card 2: Frankenstein Builder
        rounded_rect(draw, (60, 760, W - 60, 1150), WHITE, radius=24, outline=BLUE, width=4)
        draw.text((100, 800), "🧩 Frankenstein Builder", font=font(40, True), fill=BLUE)
        draw.text((100, 860), "Arrange essay paragraphs using AI structure!", font=font(28), fill=DARK)
        
        roles = ["🪝 1. Hook", "🌐 2. Context", "🎯 3. Thesis", "📊 4. Evidence", "💡 5. Analysis"]
        for r_i, role in enumerate(roles):
            rx = 100 + (r_i % 3) * 280
            ry = 930 + (r_i // 3) * 80
            rounded_rect(draw, (rx, ry, rx + 260, ry + 65), BLUE_LIGHT, radius=12, outline=BLUE)
            draw.text((rx + 15, ry + 15), role, font=font(20, True), fill=BLUE)
            
        # Card 3: AI Examiner Feedback
        rounded_rect(draw, (60, 1190, W - 60, 1580), OK_BG, radius=24, outline=GREEN, width=4)
        draw.text((100, 1230), "✉️ AI Exam Simulator", font=font(40, True), fill=GREEN)
        draw.text((100, 1290), "Write exam emails with instant AI feedback!", font=font(28), fill=DARK)
        
        draw_stamp(draw, W / 2, 1450, "SCORE: 5/5 ⭐", "All criteria passed!", clamp((t_sec - 7.5) / 0.8), GREEN)

    else:
        # Phase 4: Final CTA
        p_cta = clamp((t_sec - 9.0) / 0.8)
        e_cta = bounce_out(p_cta)
        
        card_w, card_h = 960, 1200
        cx, cy = W / 2, 850
        
        x1 = cx - (card_w / 2) * e_cta
        y1 = cy - (card_h / 2) * e_cta
        x2 = cx + (card_w / 2) * e_cta
        y2 = cy + (card_h / 2) * e_cta
        
        rounded_rect(draw, (x1, y1, x2, y2), WHITE, radius=32, outline=BLUE, width=5)
        
        draw.text((120, y1 + 90), "START LEARNING TODAY!", font=font(36, True), fill=RED)
        draw.text((120, y1 + 150), "LingoSpark.study", font=font(64, True), fill=BLUE)
        
        lines = wrap("Free vocabulary games, flashcards, essay writing tools & classroom challenges all in one place!", 26)
        for i_l, line in enumerate(lines):
            draw.text((120, y1 + 270 + i_l * 48), line, font=font(32), fill=DARK)
            
        # Sub-badges with rich icons
        rounded_rect(draw, (120, y1 + 520, W - 120, y1 + 630), BLUE_LIGHT, radius=20)
        draw.text((160, y1 + 555), "🔑 No Registration Required", font=font(30, True), fill=BLUE)
        
        rounded_rect(draw, (120, y1 + 660, W - 120, y1 + 770), OK_BG, radius=20)
        draw.text((160, y1 + 695), "🆓 Try Free Right Now", font=font(30, True), fill=GREEN)
        
        # Glowing CTA Button
        btn_scale = 1.0 + 0.04 * math.sin(t_sec * 8)
        bw, bh = 800 * btn_scale, 140 * btn_scale
        bx1, by1 = cx - bw / 2, y1 + 860
        bx2, by2 = cx + bw / 2, by1 + bh
        
        rounded_rect(draw, (bx1, by1, bx2, by2), RED, radius=30)
        draw.text((cx - 270, by1 + 42), "VISIT LINGOSPARK ➔", font=font(40, True), fill=WHITE)
        
        draw_sparkle_burst(draw, cx, by1 + 70, (t_sec % 1.0), 120)


# ==============================================================================
# PROMO 2: VOCAB BOMB DEFUSAL & VOCAB FRENZY
# ==============================================================================
def render_promo_vocab_frenzy(draw: ImageDraw.ImageDraw, img: Image.Image, f_idx: int, t: float, t_sec: float):
    draw_top_bar(draw)
    
    if t_sec < 3.0:
        # Phase 1: High Tension Alert
        p_flash = abs(math.sin(t_sec * 12))
        flash_bg = (255, 235, 238) if p_flash > 0.5 else WHITE
        
        rounded_rect(draw, (60, 220, W - 60, 1680), flash_bg, radius=28, outline=RED, width=5)
        
        draw.text((100, 280), "⚠️ VOCABULARY LIST UNDER TIME PRESSURE!", font=font(28, True), fill=RED)
        draw.text((100, 330), "Vocabulary Bomb Defusal", font=font(54, True), fill=BLUE)
        
        # Big Bomb Graphic
        draw.text((W / 2 - 100, 480), "💣", font=font(160))
        
        # Pulsing Red Timer Box
        rounded_rect(draw, (240, 720, W - 240, 920), RED, radius=30)
        draw.text((W / 2 - 140, 770), "00:60", font=font(90, True), fill=WHITE)
        
        draw.text((W / 2 - 240, 960), "You only have 60 seconds!", font=font(36, True), fill=DARK)
        draw.text((W / 2 - 300, 1020), "Every correct answer gives +5 seconds!", font=font(30), fill=MUTED)
        
        # Bottom callout with icon
        rounded_rect(draw, (100, 1200, W - 100, 1500), WHITE, radius=20, outline=BLUE, width=3)
        draw.text((130, 1250), "📋 Paste your class vocabulary list", font=font(32, True), fill=BLUE)
        draw.text((130, 1310), "and start rapid review!", font=font(30), fill=DARK)

    elif t_sec < 6.0:
        # Phase 2: Live Typing & Defuse Simulation
        draw.text((70, 200), "FAST TYPING & QUICK REACTION", font=font(30, True), fill=RED)
        draw.text((70, 245), "Type the Correct Word!", font=font(52, True), fill=BLUE)
        
        rounded_rect(draw, (60, 320, W - 60, 1200), WHITE, radius=28, outline=BLUE, width=4)
        
        # Timer display top right
        rounded_rect(draw, (W - 320, 360, W - 100, 440), RED, radius=16)
        draw.text((W - 290, 380), "⏱️ 54s", font=font(36, True), fill=WHITE)
        
        # Question Definition
        draw.text((100, 380), "📖 WORD DEFINITION:", font=font(24, True), fill=RED)
        draw.text((100, 430), "Extremely large or huge in size", font=font(40, True), fill=DARK)
        
        # Word Type Badge with icon
        rounded_rect(draw, (100, 520, 440, 580), BLUE_LIGHT, radius=12, outline=BLUE)
        draw.text((120, 535), "🏷️ TYPE: ADJECTIVE", font=font(24, True), fill=BLUE)
        
        # Animated Typing Input Box
        target_word = "MASSIVE"
        type_progress = clamp((t_sec - 3.2) / 1.5)
        chars_to_show = int(len(target_word) * type_progress)
        typed_str = target_word[:chars_to_show] + ("|" if type_progress < 1.0 else "")
        
        rounded_rect(draw, (100, 640, W - 100, 780), GREY, radius=20, outline=BLUE if type_progress < 1.0 else GREEN, width=4)
        draw.text((140, 685), typed_str, font=font(48, True), fill=DARK if type_progress < 1.0 else GREEN)
        
        # Action Defuse Button
        is_submitted = t_sec >= 4.8
        btn_bg = GREEN if is_submitted else BLUE
        btn_txt = "✓ DONE! (+5s)" if is_submitted else "💣 DEFUSE BOMB!"
        
        rounded_rect(draw, (100, 840, W - 100, 980), btn_bg, radius=24)
        draw.text((W / 2 - 200, 885), btn_txt, font=font(38, True), fill=WHITE)
        
        if is_submitted:
            draw_stamp(draw, W / 2, 1080, "CORRECT ANSWER!", "+5s TIME BONUS", clamp((t_sec - 4.8) / 0.5), GREEN)

    elif t_sec < 9.0:
        # Phase 3: Vocab Auction & Multi-mode Frenzy
        draw.text((70, 200), "VOCAB AUCTION MODE", font=font(30, True), fill=RED)
        draw.text((70, 245), "Bet Chips with Confidence!", font=font(52, True), fill=BLUE)
        
        rounded_rect(draw, (60, 320, W - 60, 1550), WHITE, radius=28, outline=GOLD, width=4)
        
        # Bankroll Display with icon
        rounded_rect(draw, (100, 360, W - 100, 480), YELLOW_LIGHT, radius=20, outline=GOLD, width=3)
        draw.text((130, 400), "💰 BANKROLL: 1,400 CHIPS 🪙", font=font(36, True), fill=DARK)
        
        # Card options with rich icons
        opts = [
            ("A) 🔤 Tiny", RED, False),
            ("B) 🌟 Massive", GREEN, True),
            ("C) 🤫 Silent", RED, False),
            ("D) ⚡ Swift", RED, False)
        ]
        for idx, (opt_txt, c_o, is_correct) in enumerate(opts):
            ox = 100 + (idx % 2) * 450
            oy = 530 + (idx // 2) * 180
            
            card_fill = OK_BG if (is_correct and t_sec > 7.2) else WHITE
            card_out = c_o if (is_correct and t_sec > 7.2) else BORDER
            
            rounded_rect(draw, (ox, oy, ox + 420, oy + 150), card_fill, radius=18, outline=card_out, width=3)
            draw.text((ox + 20, oy + 50), opt_txt, font=font(32, True), fill=BLUE if not (is_correct and t_sec > 7.2) else GREEN)
            
        # Bet slider bar simulation with icon
        rounded_rect(draw, (100, 940, W - 100, 1080), GREY, radius=20)
        draw.text((140, 970), "🎲 CHIP BET: 100 CHIPS 🪙", font=font(28, True), fill=BLUE)
        
        slider_w = int(600 * clamp((t_sec - 6.5) / 1.0))
        rounded_rect(draw, (140, 1020, 140 + slider_w, 1040), BLUE, radius=10)
        
        if t_sec > 7.5:
            draw_stamp(draw, W / 2, 1260, "AUCTION WON!", "+200 CHIPS REWARD 🪙", clamp((t_sec - 7.5) / 0.5), GREEN)

    else:
        # Phase 4: Final Call To Action
        p_cta = clamp((t_sec - 9.0) / 0.8)
        e_cta = bounce_out(p_cta)
        
        rounded_rect(draw, (60, 220, W - 60, 1680), WHITE, radius=32, outline=RED, width=5)
        
        draw.text((100, 300), "REVIEW WORDS WITHOUT BOREDOM!", font=font(30, True), fill=RED)
        draw.text((100, 360), "LingoSpark Vocab Games", font=font(54, True), fill=BLUE)
        
        games = [
            ("🎴 Classic Flashcards", "Smart flashcards with unmastered filter"),
            ("💣 Bomb Defusal", "Time pressure, typing & bonus seconds"),
            ("♟️ Grid Territory", "Tactical tic-tac-toe for 1 or 2 players"),
            ("🔨 Vocab Auction", "Bet chips based on your confidence")
        ]
        
        for idx, (g_title, g_desc) in enumerate(games):
            gy = 480 + idx * 240
            rounded_rect(draw, (100, gy, W - 100, gy + 200), GREY, radius=20, outline=BLUE, width=2)
            draw.text((130, gy + 35), g_title, font=font(36, True), fill=BLUE)
            lines = wrap(g_desc, 28)
            for i_l, l in enumerate(lines):
                draw.text((130, gy + 85 + i_l * 36), l, font=font(26), fill=MUTED)
                
        # CTA Pill Button
        rounded_rect(draw, (100, 1480, W - 100, 1620), RED, radius=30)
        draw.text((W / 2 - 270, 1525), "PLAY AT LINGOSPARK.STUDY ➔", font=font(34, True), fill=WHITE)


# ==============================================================================
# PROMO 3: WRITING SUITE & FRANKENSTEIN ESSAY BUILDER
# ==============================================================================
def render_promo_writing_suite(draw: ImageDraw.ImageDraw, img: Image.Image, f_idx: int, t: float, t_sec: float):
    draw_top_bar(draw)
    
    if t_sec < 3.0:
        # Phase 1: Intro Hook AI Writing Suite
        draw.text((70, 200), "ARTIFICIAL INTELLIGENCE IN WRITING", font=font(28, True), fill=RED)
        draw.text((70, 245), "LingoSpark Writing Suite", font=font(54, True), fill=BLUE)
        
        rounded_rect(draw, (60, 330, W - 60, 1650), WHITE, radius=28, outline=BLUE, width=4)
        
        draw.text((100, 390), "Master Essay Paragraph Structure", font=font(38, True), fill=BLUE)
        draw.text((100, 445), "Master academic paragraph structure step by step!", font=font(26), fill=MUTED)
        
        # 5 Structure Blocks visual with rich icons
        structure = [
            ("🪝 1. HOOK", "Attention-grabbing opening hook", RED),
            ("🌐 2. CONTEXT", "Topic background and context", BLUE),
            ("🎯 3. THESIS", "Core essay thesis claim", BLUE),
            ("📊 4. EVIDENCE", "Data, studies, and research evidence", BLUE),
            ("💡 5. ANALYSIS", "Argument analysis and conclusion", GREEN)
        ]
        
        for idx, (role, desc, c_r) in enumerate(structure):
            b_delay = clamp((t_sec - 0.2 - idx * 0.3) / 0.5)
            if b_delay > 0:
                e_b = ease_out_cubic(b_delay)
                by = 530 + idx * 210
                bx = int(100 + (1.0 - e_b) * -300)
                rounded_rect(draw, (bx, by, W - 100, by + 180), GREY, radius=20, outline=c_r, width=3)
                draw.text((bx + 40, by + 35), role, font=font(34, True), fill=c_r)
                draw.text((bx + 40, by + 90), desc, font=font(26), fill=DARK)

    elif t_sec < 6.0:
        # Phase 2: Frankenstein Builder Drag & Drop Simulation
        draw.text((70, 200), "FRANKENSTEIN BUILDER", font=font(30, True), fill=RED)
        draw.text((70, 245), "Arrange Scrambled Sentences!", font=font(50, True), fill=BLUE)
        
        rounded_rect(draw, (60, 320, W - 60, 1600), WHITE, radius=28, outline=BLUE, width=4)
        
        sentences = [
            ("What if the most powerful classroom tool was silence?", "✓ 🪝 1. Hook", GREEN if t_sec > 4.5 else RED),
            ("Debates about phones have divided teachers.", "✓ 🌐 2. Context", GREEN if t_sec > 4.5 else BLUE),
            ("Schools should ban smartphones in lessons.", "✓ 🎯 3. Thesis", GREEN if t_sec > 4.5 else BLUE),
            ("A 2023 study found students scored 12% higher.", "✓ 📊 4. Evidence", GREEN if t_sec > 4.5 else BLUE),
            ("This suggests attention drives real learning gains.", "✓ 💡 5. Analysis", GREEN if t_sec > 4.5 else GREEN)
        ]
        
        for idx, (text_s, role_lbl, c_card) in enumerate(sentences):
            sy = 360 + idx * 220
            
            card_fill = OK_BG if t_sec > 4.8 else WHITE
            
            rounded_rect(draw, (100, sy, W - 100, sy + 190), card_fill, radius=18, outline=c_card, width=3)
            draw.text((130, sy + 25), role_lbl, font=font(26, True), fill=c_card)
            lines = wrap(text_s, 32)
            for i_l, l in enumerate(lines[:2]):
                draw.text((130, sy + 70 + i_l * 36), l, font=font(28), fill=DARK)
                
            draw.text((W - 180, sy + 70), "▲▼", font=font(32, True), fill=BLUE)
            
        if t_sec > 5.0:
            draw_stamp(draw, W / 2, 1480, "ACADEMIC FLOW!", "100% CORRECT STRUCTURE", clamp((t_sec - 5.0) / 0.5), GREEN)

    elif t_sec < 9.0:
        # Phase 3: Bloat Slasher & Vocab Upgrade
        draw.text((70, 200), "LANGUAGE PRECISION TOOLS", font=font(30, True), fill=RED)
        draw.text((70, 245), "Bloat Slasher & Vocab Upgrade", font=font(50, True), fill=BLUE)
        
        # Card 1: Bloat Slasher
        rounded_rect(draw, (60, 320, W - 60, 880), WHITE, radius=24, outline=RED, width=4)
        draw.text((100, 360), "✂️ Bloat Slasher", font=font(38, True), fill=RED)
        draw.text((100, 415), "Cut wordy filler from academic sentences!", font=font(26), fill=MUTED)
        
        rounded_rect(draw, (100, 480, W - 100, 720), GREY, radius=18)
        draw.text((130, 510), "It is widely considered to be a well-known fact that", font=font(24), fill=MUTED)
        draw.line((130, 525, 800, 525), fill=RED, width=4)
        
        draw.text((130, 570), "✓ Daily reading improves vocabulary.", font=font(34, True), fill=GREEN)
        
        rounded_rect(draw, (100, 750, W - 100, 830), OK_BG, radius=14)
        draw.text((140, 775), "⚡ Reduced 13 words to 5! Clear & direct.", font=font(26, True), fill=GREEN)
        
        # Card 2: Vocabulary Upgrade
        rounded_rect(draw, (60, 920, W - 60, 1550), WHITE, radius=24, outline=BLUE, width=4)
        draw.text((100, 960), "🔤 Vocabulary Upgrade", font=font(38, True), fill=BLUE)
        draw.text((100, 1015), "Elevate vocabulary to formal academic level!", font=font(26), fill=MUTED)
        
        rounded_rect(draw, (100, 1080, W - 100, 1320), BLUE_LIGHT, radius=18)
        draw.text((130, 1110), " Everyday word: 'The study showed BIG differences.'", font=font(24), fill=MUTED)
        
        p_up = clamp((t_sec - 7.5) / 0.8)
        if p_up > 0:
            draw.text((130, 1180), "🌟 Upgrade: 'SUBSTANTIAL differences.'", font=font(30, True), fill=BLUE)
            draw_sparkle_burst(draw, 700, 1200, p_up, 90)
            
        rounded_rect(draw, (100, 1360, W - 100, 1500), OK_BG, radius=18, outline=GREEN, width=3)
        draw.text((140, 1410), "✓ Upgraded writing register with AI!", font=font(28, True), fill=GREEN)

    else:
        # Phase 4: Call To Action
        p_cta = clamp((t_sec - 9.0) / 0.8)
        e_cta = bounce_out(p_cta)
        
        rounded_rect(draw, (60, 220, W - 60, 1680), WHITE, radius=32, outline=BLUE, width=5)
        
        draw.text((100, 300), "FOR STUDENTS & TEACHERS!", font=font(32, True), fill=RED)
        draw.text((100, 360), "LingoSpark Writing Suite", font=font(54, True), fill=BLUE)
        
        tools = [
            ("🧩 Frankenstein Builder", "Paragraph structure (Hook, Context, Thesis, Evidence, Analysis)"),
            ("🌉 Transition Matcher", "Sentence connectors & academic cohesion"),
            ("⚖️ The Devil's Advocate", "Thesis analysis & counter-argument drafting"),
            ("✂️ Bloat Slasher", "Eliminate wordiness & redundant phrases"),
            ("🔤 Vocabulary Upgrade", "Swap everyday words for formal vocabulary"),
            ("🐉 Word-Forged Odyssey", "Write story actions using target vocabulary!")
        ]
        
        for idx, (t_name, t_desc) in enumerate(tools):
            ty = 460 + idx * 160
            rounded_rect(draw, (100, ty, W - 100, ty + 140), GREY, radius=16, outline=BORDER)
            draw.text((130, ty + 20), t_name, font=font(30, True), fill=BLUE)
            draw.text((130, ty + 70), t_desc, font=font(22), fill=DARK)
            
        # CTA Button
        rounded_rect(draw, (100, 1480, W - 100, 1620), RED, radius=30)
        draw.text((W / 2 - 270, 1525), "TRY WRITING SUITE TODAY ➔", font=font(34, True), fill=WHITE)


# ==============================================================================
# PROMO 4: PRIMARY ENGLISH (A1-B1)
# ==============================================================================
def render_promo_primary_english(draw: ImageDraw.ImageDraw, img: Image.Image, f_idx: int, t: float, t_sec: float):
    draw_top_bar(draw)
    
    if t_sec < 3.0:
        # Phase 1: Primary English CEFR Intro
        draw.text((70, 200), "PRIMARY & LOWER SECONDARY PREP", font=font(28, True), fill=RED)
        draw.text((70, 245), "Primary English Prep", font=font(56, True), fill=BLUE)
        
        rounded_rect(draw, (60, 330, W - 60, 1650), WHITE, radius=28, outline=BLUE, width=4)
        
        draw.text((100, 390), "4 Level-Matched Writing Games", font=font(34, True), fill=MUTED)
        
        # CEFR Level Badges bouncing in with rich icons
        levels = [
            ("🎓 A1", "Beginner — simple words & descriptive phrases", RED, 480),
            ("⭐ A2", "Elementary — everyday phrases & exam emails", BLUE, 760),
            ("🚀 B1", "Intermediate — richer vocabulary & linked ideas", GREEN, 1040)
        ]
        
        for idx, (lvl, desc, c_lvl, target_y) in enumerate(levels):
            l_delay = clamp((t_sec - 0.3 - idx * 0.3) / 0.5)
            if l_delay > 0:
                e_l = bounce_out(l_delay)
                lx = int(100 + (1.0 - e_l) * -300)
                rounded_rect(draw, (lx, target_y, W - 100, target_y + 220), WHITE, radius=24, outline=c_lvl, width=4)
                
                rounded_rect(draw, (lx + 30, target_y + 40, lx + 190, target_y + 180), c_lvl, radius=20)
                draw.text((lx + 50, target_y + 75), lvl, font=font(46, True), fill=WHITE)
                
                draw.text((lx + 220, target_y + 60), f"CEFR Level {lvl[2:]}", font=font(36, True), fill=BLUE)
                lines = wrap(desc, 24)
                for i_l, l in enumerate(lines):
                    draw.text((lx + 220, target_y + 115 + i_l * 36), l, font=font(26), fill=MUTED)

    elif t_sec < 6.0:
        # Phase 2: Boring to Brilliant Transformation
        draw.text((70, 200), "BORING TO BRILLIANT", font=font(30, True), fill=RED)
        draw.text((70, 245), "Turn Plain Words Into Vivid Writing!", font=font(48, True), fill=BLUE)
        
        rounded_rect(draw, (60, 320, W - 60, 1550), WHITE, radius=28, outline=GOLD, width=4)
        
        # Plain sentence box
        rounded_rect(draw, (100, 380, W - 100, 620), GREY, radius=20, outline=BORDER)
        draw.text((130, 420), "📝 PLAIN SENTENCE:", font=font(24, True), fill=RED)
        draw.text((130, 470), "The [ GOOD ] dog played in the [ BIG ] park.", font=font(30), fill=DARK)
        
        p_trans = clamp((t_sec - 4.2) / 0.8)
        
        if p_trans > 0:
            # Transformation Box
            rounded_rect(draw, (100, 660, W - 100, 960), YELLOW_LIGHT, radius=20, outline=GOLD, width=3)
            draw.text((130, 700), "✨ VOCABULARY ENRICHMENT (AI):", font=font(26, True), fill=GOLD)
            draw.text((130, 760), "The [ PLAYFUL ] dog played in the", font=font(32, True), fill=BLUE)
            draw.text((130, 820), "[ SPACIOUS ] park.", font=font(32, True), fill=BLUE)
            
            draw_sparkle_burst(draw, W / 2, 880, p_trans, 110)
            
            draw_stamp(draw, W / 2, 1220, "✨ BRILLIANT! (+10 PTS)", "Vivid adjectives applied!", clamp((t_sec - 4.8) / 0.5), GREEN)

    elif t_sec < 9.0:
        # Phase 3: Detail Detective & Exam Simulator
        draw.text((70, 200), "DETAIL DETECTIVE & EXAM SIMULATOR", font=font(28, True), fill=RED)
        draw.text((70, 245), "English Exam Preparation", font=font(48, True), fill=BLUE)
        
        rounded_rect(draw, (60, 320, W - 60, 1580), WHITE, radius=28, outline=GREEN, width=4)
        
        draw.text((100, 360), "✉️ Exam Email Simulator", font=font(38, True), fill=GREEN)
        draw.text((100, 415), "Practice writing exam emails with instant AI feedback!", font=font(26), fill=MUTED)
        
        # Email mock box
        rounded_rect(draw, (100, 480, W - 100, 980), GREY, radius=20, outline=BORDER)
        draw.text((130, 520), "✉️ TASK: Write an email inviting a friend to a picnic.", font=font(24, True), fill=BLUE)
        draw.text((130, 570), "• Specify time and place of picnic", font=font(24), fill=DARK)
        draw.text((130, 610), "• Suggest what food to bring", font=font(24), fill=DARK)
        
        draw.line((130, 660, W - 130, 660), fill=BORDER, width=2)
        
        draw.text((130, 690), "Hi Sam! Would you like to come to a picnic this", font=font(24), fill=DARK)
        draw.text((130, 730), "Saturday at 2 PM in Central Park? I can bring...", font=font(24), fill=DARK)
        
        draw.text((W - 280, 920), "Word count: 58 / 120", font=font(22, True), fill=MUTED)
        
        if t_sec > 7.5:
            draw_stamp(draw, W / 2, 1280, "EXAMINER SCORE: 5/5 ⭐", "All bullet points & word limit passed!", clamp((t_sec - 7.5) / 0.5), GREEN)

    else:
        # Phase 4: CTA
        p_cta = clamp((t_sec - 9.0) / 0.8)
        e_cta = bounce_out(p_cta)
        
        rounded_rect(draw, (60, 220, W - 60, 1680), WHITE, radius=32, outline=RED, width=5)
        
        draw.text((100, 300), "FOR PRIMARY & SECONDARY STUDENTS", font=font(30, True), fill=RED)
        draw.text((100, 360), "Primary English LingoSpark", font=font(52, True), fill=BLUE)
        
        pe_games = [
            ("✨ Boring to Brilliant", "Enrich plain words with vivid adjectives & adverbs"),
            ("🔍 Detail Detective", "Expand simple sentences with evidence & place details"),
            ("🔗 Link Master", "Connect short sentences with because & so"),
            ("✉️ Exam Simulator", "Write exam emails with instant AI examiner feedback")
        ]
        
        for idx, (p_title, p_desc) in enumerate(pe_games):
            py = 480 + idx * 240
            rounded_rect(draw, (100, py, W - 100, py + 200), GREY, radius=20, outline=BLUE, width=2)
            draw.text((130, py + 35), p_title, font=font(36, True), fill=BLUE)
            lines = wrap(p_desc, 28)
            for i_l, l in enumerate(lines):
                draw.text((130, py + 85 + i_l * 36), l, font=font(26), fill=MUTED)
                
        # CTA Button
        rounded_rect(draw, (100, 1480, W - 100, 1620), RED, radius=30)
        draw.text((W / 2 - 270, 1525), "PLAY AT LINGOSPARK.STUDY ➔", font=font(34, True), fill=WHITE)


def main():
    print("Generating 4 graphically exciting, dynamic LingoSpark promotional shorts (ENGLISH)...")
    
    create_promo_video("promo-01-lingospark-overview", render_promo_overview)
    create_promo_video("promo-02-vocab-frenzy", render_promo_vocab_frenzy)
    create_promo_video("promo-03-ai-writing-suite", render_promo_writing_suite)
    create_promo_video("promo-04-primary-english", render_promo_primary_english)
    
    print("\n[ALL 4 PROMO SHORTS RENDERED SUCCESSFULLY IN ENGLISH!]")


if __name__ == "__main__":
    main()
