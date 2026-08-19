"""
Generator for all 14 LingoSpark instructional shorts (1080x1920, 9:16 vertical, max. 20 seconds)
Covers all games in Vocab Review, Writing Suite, and Primary English.
No BGM. Clear, engaging high-school teacher British English voiceover (Sonia).
Accurate LingoSpark UI reproduction with detailed instructions.
"""
from __future__ import annotations

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
BLUE = (1, 33, 105)       # --royal-blue #012169
RED = (200, 16, 46)       # --pillarbox-red #C8102E
GREEN = (0, 130, 59)      # --success-green #00823B
WHITE = (255, 255, 255)
GREY = (244, 245, 247)     # --light-grey #F4F5F7
DARK = (45, 45, 45)       # --text-dark #2D2D2D
MUTED = (90, 90, 90)      # --text-muted #5A5A5A
BORDER = (224, 224, 224)   # --border-light #E0E0E0
OK_BG = (232, 245, 233)


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


def rounded_rect(draw: ImageDraw.ImageDraw, box, fill, radius=16, outline=None, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def wrap(text: str, width: int = 34) -> list[str]:
    return textwrap.wrap(text, width=width) or [""]


def draw_header(draw: ImageDraw.ImageDraw, title: str, badge: str | None = None, level_badge: str | None = None):
    rounded_rect(draw, (48, 48, W - 48, 150), WHITE, radius=16, outline=BORDER, width=2)
    draw.text((72, 72), "← Exit", font=font(28), fill=MUTED)
    
    f_title = font(32, True)
    bbox = draw.textbbox((0, 0), title, font=f_title)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw) / 2 - (40 if badge else 0), 68), title, font=f_title, fill=BLUE)
    
    if badge:
        bx = (W + tw) / 2 - 20
        rounded_rect(draw, (bx, 70, bx + 150, 118), RED, radius=20)
        draw.text((bx + 18, 78), badge, font=font(22, True), fill=WHITE)
    
    if level_badge:
        lx = W - 160
        rounded_rect(draw, (lx, 70, lx + 80, 118), BLUE, radius=12)
        draw.text((lx + 20, 76), level_badge, font=font(24, True), fill=WHITE)


def draw_callout(draw: ImageDraw.ImageDraw, text: str, y: int = 1720, color=BLUE):
    rounded_rect(draw, (48, y, W - 48, y + 120), color, radius=16)
    lines = wrap(text, 40)
    ty = y + 28
    for line in lines[:2]:
        f = font(30, True)
        bbox = draw.textbbox((0, 0), line, font=f)
        tw = bbox[2] - bbox[0]
        draw.text(((W - tw) / 2, ty), line, font=f, fill=WHITE)
        ty += 40


def new_frame() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (W, H), GREY)
    return img, ImageDraw.Draw(img)


def draw_title_slide(title: str, subtitle: str, category: str, icon_symbol: str = "★") -> Image.Image:
    img, d = new_frame()
    d.text((90, 520), category.upper(), font=font(34, True), fill=RED)
    d.text((90, 580), title, font=font(60, True), fill=BLUE)
    d.text((90, 680), subtitle, font=font(32), fill=MUTED)
    
    rounded_rect(d, (90, 820, W - 90, 1180), WHITE, radius=24, outline=BLUE, width=4)
    d.ellipse((140, 880, 300, 1040), fill=(235, 240, 255))
    d.text((195, 920), icon_symbol, font=font(64, True), fill=BLUE)
    
    d.text((340, 930), "How To Play Guide", font=font(40, True), fill=BLUE)
    d.text((340, 990), "Step-by-step tutorial", font=font(28), fill=MUTED)
    
    draw_callout(d, f"Master {title} on LingoSpark", 1700)
    return img


def draw_cta_slide(title: str, steps: list[str]) -> Image.Image:
    img, d = new_frame()
    d.text((90, 480), "Quick Recap", font=font(36), fill=MUTED)
    d.text((90, 540), title, font=font(56, True), fill=BLUE)
    
    rounded_rect(d, (90, 680, W - 90, 1260), WHITE, radius=24, outline=RED, width=4)
    for i, step in enumerate(steps):
        sy = 730 + i * 170
        d.ellipse((130, sy, 210, sy + 80), fill=BLUE)
        d.text((158, sy + 18), str(i + 1), font=font(36, True), fill=WHITE)
        lines = wrap(step, 30)
        ty = sy + 10
        for l in lines[:2]:
            d.text((240, ty), l, font=font(32, True), fill=DARK)
            ty += 38
            
    rounded_rect(d, (90, 1380, W - 90, 1540), BLUE, radius=24)
    d.text((200, 1430), "Play now at lingospark.study", font=font(38, True), fill=WHITE)
    d.text((90, 1680), "LingoSpark · Gamify Your Words", font=font(30), fill=MUTED)
    return img


def generate_speech(text: str, wav_path: Path):
    """Create an engaging high-school teacher British-English neural narration."""
    subprocess.run([
        "python", "-m", "edge_tts",
        "--voice", "en-GB-SoniaNeural",
        "--rate=+2%",
        "--text", text,
        "--write-media", str(wav_path),
    ], check=True)


def build_short_video(game_id: str, frames_data: list[tuple[Image.Image, float]], vo_text: str, out_mp4: Path):
    frames_dir = ROOT / f"frames_{game_id}"
    frames_dir.mkdir(parents=True, exist_ok=True)
    
    seq_paths = []
    for idx, (img, dur) in enumerate(frames_data):
        p = frames_dir / f"frame_{idx:02d}.png"
        img.save(p, "PNG")
        seq_paths.append((p, dur))
        
    concat_file = frames_dir / "concat.txt"
    concat_lines = []
    for p, dur in seq_paths:
        concat_lines.append(f"file '{p.as_posix()}'")
        concat_lines.append(f"duration {dur:.2f}")
    concat_lines.append(f"file '{seq_paths[-1][0].as_posix()}'")
    concat_file.write_text("\n".join(concat_lines), encoding="utf-8")
    
    vo_mp3 = frames_dir / "voiceover.mp3"
    generate_speech(vo_text, vo_mp3)
    
    silent_mp4 = frames_dir / "silent.mp4"
    cmd_vid = [
        str(FFMPEG), "-y", "-f", "concat", "-safe", "0", "-i", str(concat_file),
        "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", str(silent_mp4)
    ]
    subprocess.run(cmd_vid, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    cmd_mux = [
        str(FFMPEG), "-y", "-i", str(silent_mp4), "-i", str(vo_mp3),
        "-filter_complex", "[0:v]tpad=stop_mode=clone:stop_duration=10[v]",
        "-map", "[v]", "-map", "1:a", "-c:v", "libx264", "-c:a", "aac", "-b:a", "192k",
        "-t", "19.8", "-shortest", str(out_mp4)
    ]
    subprocess.run(cmd_mux, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"[OK] Short generated: {out_mp4.name}")


# ==============================================================================
# GAME BUILDERS
# ==============================================================================

# 1. CLASSIC FLASHCARDS
def build_flashcard():
    frames = []
    frames.append((draw_title_slide("Classic Flashcards", "Interactive flippable cards", "Vocab Review", "🎴"), 3.2))
    
    # Frame 1: Front card
    img, d = new_frame()
    draw_header(d, "Classic Flashcards")
    d.text((W // 2 - 160, 220), "Cards left in deck: 5", font=font(30, True), fill=MUTED)
    
    rounded_rect(d, (140, 320, 420, 370), BLUE, radius=10)
    d.text((160, 332), "WORD TYPE: NOUN", font=font(20, True), fill=WHITE)
    
    rounded_rect(d, (140, 420, W - 140, 920), WHITE, radius=24, outline=BLUE, width=4)
    d.text((W // 2 - 120, 640), "A red fruit", font=font(48, True), fill=BLUE)
    d.text((W // 2 - 110, 840), "Tap card to flip", font=font(28), fill=MUTED)
    draw_callout(d, "Read prompt & word type, then tap to flip!")
    frames.append((img, 4.5))
    
    # Frame 2: Flipped card
    img, d = new_frame()
    draw_header(d, "Classic Flashcards")
    d.text((W // 2 - 160, 220), "Cards left in deck: 5", font=font(30, True), fill=MUTED)
    
    rounded_rect(d, (140, 420, W - 140, 920), BLUE, radius=24, outline=BLUE, width=4)
    d.text((W // 2 - 80, 640), "Apple", font=font(56, True), fill=WHITE)
    
    # Controls
    rounded_rect(d, (140, 1000, 480, 1100), RED, radius=30)
    d.text((210, 1040), "✕ Don't Know", font=font(32, True), fill=WHITE)
    rounded_rect(d, (520, 1000, W - 140, 1100), GREEN, radius=30)
    d.text((610, 1040), "✓ Know", font=font(32, True), fill=WHITE)
    
    draw_callout(d, "Mark Know or Don't Know to filter deck!")
    frames.append((img, 4.5))
    
    # Frame 3: Next card
    img, d = new_frame()
    draw_header(d, "Classic Flashcards")
    d.text((W // 2 - 160, 220), "Cards left in deck: 4", font=font(30, True), fill=GREEN)
    
    rounded_rect(d, (140, 420, W - 140, 920), WHITE, radius=24, outline=BLUE, width=4)
    d.text((W // 2 - 140, 640), "A place to live", font=font(48, True), fill=BLUE)
    
    draw_callout(d, "Repeat unknown cards until 100% deck mastery!", 1700, GREEN)
    frames.append((img, 4.5))
    
    frames.append((draw_cta_slide("Classic Flashcards", [
        "Paste your custom vocabulary list",
        "Flip cards between definition & word",
        "Mark Know / Don't Know for 100% mastery"
    ]), 4.0))
    
    vo = (
        "Welcome to Classic Flashcards on LingoSpark! "
        "Paste your vocabulary list, then tap any card to flip between definition and term. "
        "Mark 'Know' when you've mastered a word, or 'Don't Know' to keep it in rotation! "
        "Have fun learning!"
    )
    build_short_video("flashcard", frames, vo, ROOT / "howto-flashcard.mp4")


# 2. VOCABULARY BOMB DEFUSAL
def build_bomb():
    frames = []
    frames.append((draw_title_slide("Bomb Defusal", "Race against the clock", "Vocab Review", "💣"), 3.2))
    
    # Frame 1: Clock counting
    img, d = new_frame()
    draw_header(d, "Vocabulary Bomb Defusal")
    d.text((W // 2 - 40, 200), "💣", font=font(72))
    d.text((W // 2 - 50, 290), "60", font=font(80, True), fill=RED)
    
    rounded_rect(d, (380, 390, 700, 440), BLUE, radius=10)
    d.text((400, 402), "WORD TYPE: NOUN", font=font(20, True), fill=WHITE)
    
    d.text((W // 2 - 140, 470), "A place to live", font=font(46, True), fill=BLUE)
    
    rounded_rect(d, (140, 580, W - 140, 680), WHITE, radius=16, outline=BLUE, width=3)
    d.text((180, 615), "House|", font=font(36), fill=DARK)
    
    rounded_rect(d, (140, 720, 480, 810), BLUE, radius=30)
    d.text((240, 750), "Defuse!", font=font(32, True), fill=WHITE)
    rounded_rect(d, (520, 720, W - 140, 810), RED, radius=30)
    d.text((580, 750), "Skip (-5s)", font=font(32, True), fill=WHITE)
    
    draw_callout(d, "Type matching word before clock runs out!")
    frames.append((img, 4.5))
    
    # Frame 2: Correct bonus
    img, d = new_frame()
    draw_header(d, "Vocabulary Bomb Defusal")
    d.text((W // 2 - 40, 200), "💣", font=font(72))
    d.text((W // 2 - 50, 290), "65", font=font(80, True), fill=GREEN)
    d.text((W // 2 - 180, 380), "+5s Time Bonus!", font=font(32, True), fill=GREEN)
    d.text((W // 2 - 120, 470), "A red fruit", font=font(46, True), fill=BLUE)
    
    rounded_rect(d, (140, 580, W - 140, 680), WHITE, radius=16, outline=BLUE, width=3)
    d.text((180, 615), "Type answer...", font=font(32), fill=MUTED)
    
    draw_callout(d, "Correct answers add +5s time! Skips cost 5s!", 1700, GREEN)
    frames.append((img, 4.5))
    
    frames.append((draw_cta_slide("Bomb Defusal", [
        "Race the ticking 60-second timer",
        "Type matching words for bonus time",
        "Avoid skips & mistakes to defuse!"
    ]), 4.0))
    
    vo = (
        "Welcome to Vocabulary Bomb Defusal! "
        "Race against the 60-second ticking clock by typing the matching word for each definition. "
        "Every correct answer adds bonus seconds to your timer, while mistakes or skips cost time! "
        "Defuse as many words as you can!"
    )
    build_short_video("bomb", frames, vo, ROOT / "howto-bomb.mp4")


# 3. GRID TERRITORY
def build_grid():
    frames = []
    frames.append((draw_title_slide("Grid Territory", "Tic-tac-toe with vocab", "Vocab Review", "♟️"), 3.2))
    
    # Frame 1: Grid Board
    img, d = new_frame()
    draw_header(d, "Grid Territory")
    rounded_rect(d, (240, 200, W - 240, 280), BLUE, radius=30)
    d.text((W // 2 - 150, 222), "Team 1's Turn (X)", font=font(32, True), fill=WHITE)
    
    # Draw 3x3 board
    for r in range(3):
        for c in range(3):
            x = 180 + c * 250
            y = 330 + r * 250
            rounded_rect(d, (x, y, x + 220, y + 220), WHITE, radius=16, outline=BORDER, width=3)
            if r == 0 and c == 0:
                d.text((x + 75, y + 50), "X", font=font(90, True), fill=BLUE)
            elif r == 1 and c == 1:
                d.text((x + 75, y + 50), "O", font=font(90, True), fill=RED)
                
    draw_callout(d, "Select an empty square to claim it!")
    frames.append((img, 4.5))
    
    # Frame 2: Modal question
    img, d = new_frame()
    draw_header(d, "Grid Territory")
    
    # Overlay modal
    rounded_rect(d, (120, 420, W - 120, 1120), WHITE, radius=24, outline=BLUE, width=4)
    d.text((W // 2 - 130, 460), "Claim Square", font=font(40, True), fill=BLUE)
    
    rounded_rect(d, (W // 2 - 140, 540, W // 2 + 140, 590), BLUE, radius=10)
    d.text((W // 2 - 120, 552), "WORD TYPE: NOUN", font=font(20, True), fill=WHITE)
    
    d.text((W // 2 - 110, 630), "A red fruit", font=font(38, True), fill=DARK)
    
    rounded_rect(d, (180, 740, W - 180, 840), WHITE, radius=16, outline=BLUE, width=3)
    d.text((220, 775), "Apple|", font=font(36), fill=DARK)
    
    rounded_rect(d, (220, 920, W - 220, 1020), BLUE, radius=30)
    d.text((W // 2 - 120, 955), "Claim Square!", font=font(34, True), fill=WHITE)
    
    draw_callout(d, "Answer correctly to claim X/O & get 3 in a row!", 1700, GREEN)
    frames.append((img, 4.5))
    
    frames.append((draw_cta_slide("Grid Territory", [
        "Pick any empty square on 3x3 grid",
        "Answer vocab prompt to claim X or O",
        "Get 3 in a row to win the territory!"
    ]), 4.0))
    
    vo = (
        "Welcome to Grid Territory! It's tic-tac-toe powered by your vocabulary! "
        "Select an empty square on the 3x3 grid and answer the vocab prompt correctly to claim your X or O. "
        "Get three in a row to win!"
    )
    build_short_video("grid", frames, vo, ROOT / "howto-grid.mp4")


# 4. VOCAB AUCTION
def build_auction():
    frames = []
    frames.append((draw_title_slide("Vocab Auction", "Bet chips on your confidence", "Vocab Review", "🔨"), 3.2))
    
    # Frame 1: Bidding screen
    img, d = new_frame()
    draw_header(d, "Vocab Auction")
    rounded_rect(d, (80, 180, W - 80, 260), WHITE, radius=16, outline=BORDER)
    d.text((120, 205), "Bankroll:", font=font(28), fill=MUTED)
    d.text((280, 200), "1,000 Chips 🪙", font=font(36, True), fill=BLUE)
    
    rounded_rect(d, (80, 290, W - 80, 500), WHITE, radius=20, outline=BLUE, width=3)
    d.text((120, 320), "DEFINITION:", font=font(22, True), fill=RED)
    
    rounded_rect(d, (280, 315, 560, 355), BLUE, radius=10)
    d.text((295, 322), "WORD TYPE: ADJECTIVE", font=font(20, True), fill=WHITE)
    
    d.text((120, 380), "Extremely large or huge in size.", font=font(34, True), fill=DARK)
    
    rounded_rect(d, (120, 435, 380, 480), GREY, radius=12, outline=BORDER)
    d.text((140, 447), "💡 Hint (-20 chips)", font=font(22, True), fill=BLUE)
    
    # Options grid
    opts = ["A) Tiny", "B) Massive", "C) Silent", "D) Swift"]
    for i, opt in enumerate(opts):
        x = 80 + (i % 2) * 470
        y = 530 + (i // 2) * 140
        rounded_rect(d, (x, y, x + 440, y + 110), WHITE, radius=16, outline=BORDER)
        d.text((x + 30, y + 35), opt, font=font(32, True), fill=BLUE)
        
    rounded_rect(d, (80, 840, W - 80, 980), GREY, radius=20, outline=BLUE)
    d.text((120, 875), "Place Chip Bet: 40 Chips", font=font(32, True), fill=BLUE)
    d.text((120, 925), "Higher confidence = bigger chip rewards!", font=font(26), fill=MUTED)
    
    draw_callout(d, "Check word type, set chip bet & win big!")
    frames.append((img, 4.5))
    
    # Frame 2: Won auction
    img, d = new_frame()
    draw_header(d, "Vocab Auction")
    rounded_rect(d, (80, 180, W - 80, 260), WHITE, radius=16, outline=BORDER)
    d.text((120, 205), "Bankroll:", font=font(28), fill=MUTED)
    d.text((280, 200), "1,080 Chips 🪙 (+80)", font=font(36, True), fill=GREEN)
    
    rounded_rect(d, (80, 290, W - 80, 660), OK_BG, radius=20, outline=GREEN, width=4)
    d.text((W // 2 - 180, 350), "🔨 AUCTION WON!", font=font(44, True), fill=GREEN)
    d.text((W // 2 - 200, 440), "Correct Answer: Massive", font=font(36, True), fill=DARK)
    d.text((W // 2 - 160, 520), "+80 Chips Awarded!", font=font(34, True), fill=GREEN)
    
    draw_callout(d, "Correct bids win big! Build your chip stack!", 1700, GREEN)
    frames.append((img, 4.5))
    
    frames.append((draw_cta_slide("Vocab Auction", [
        "Read definition & check word type",
        "Set chip bet slider based on confidence",
        "Correct bids win chips — wrong bids lose"
    ]), 4.0))
    
    vo = (
        "Welcome to Vocab Auction on LingoSpark! "
        "Read the definition, check the word type, and use hint clues if you need help. "
        "Pick the matching word and set your chip bet slider based on your confidence. "
        "Correct bids win big chips! Lock in and build your bankroll!"
    )
    build_short_video("auction", frames, vo, ROOT / "howto-auction.mp4")


# 5. FRANKENSTEIN BUILDER
def build_frank():
    frames = []
    frames.append((draw_title_slide("Frankenstein Builder", "Rebuild essay paragraphs", "Writing Suite", "🧩"), 3.2))
    
    # Frame 1: Scrambled
    img, d = new_frame()
    draw_header(d, "Frankenstein Builder", "Cursor AI")
    d.text((64, 180), "5-Part Essay Paragraph Structure:", font=font(32, True), fill=BLUE)
    d.text((64, 230), "Hook → Context → Thesis → Evidence → Analysis", font=font(26, True), fill=RED)
    
    cards = [
        "Schools should ban smartphones in lessons.",
        "What if the most powerful classroom tool was silence?",
        "This suggests attention drives real learning gains.",
        "Debates about phones have divided teachers.",
        "A 2023 study found students scored 12% higher."
    ]
    for i, c in enumerate(cards):
        y = 290 + i * 180
        rounded_rect(d, (48, y, W - 48, y + 160), WHITE, radius=14, outline=BORDER)
        d.text((72, y + 20), f"Sentence {i+1}", font=font(22, True), fill=RED)
        lines = wrap(c, 36)
        ty = y + 55
        for l in lines[:2]:
            d.text((72, ty), l, font=font(26), fill=DARK)
            ty += 32
        # Arrow buttons
        rounded_rect(d, (W - 140, y + 30, W - 70, y + 80), GREY, radius=8)
        d.text((W - 120, y + 42), "▲", font=font(28, True), fill=BLUE)
        rounded_rect(d, (W - 140, y + 90, W - 70, y + 140), GREY, radius=8)
        d.text((W - 120, y + 102), "▼", font=font(28, True), fill=BLUE)
        
    rounded_rect(d, (48, 1220, W - 48, 1320), BLUE, radius=40)
    d.text((W // 2 - 100, 1252), "Check Order", font=font(34, True), fill=WHITE)
    
    draw_callout(d, "Move sentences up & down into 5-part order!")
    frames.append((img, 4.5))
    
    # Frame 2: Correct
    img, d = new_frame()
    draw_header(d, "Frankenstein Builder", "Cursor AI")
    d.text((64, 180), "Academic Flow Unlocked!", font=font(40, True), fill=GREEN)
    
    ordered_roles = ["Hook", "Context", "Thesis", "Evidence", "Analysis"]
    for i, r in enumerate(ordered_roles):
        y = 260 + i * 180
        rounded_rect(d, (48, y, W - 48, y + 160), OK_BG, radius=14, outline=GREEN, width=3)
        d.text((72, y + 20), f"✓ {r}", font=font(24, True), fill=GREEN)
        d.text((72, y + 65), f"Correct sentence role {i+1} locked in position.", font=font(26), fill=DARK)
        
    draw_callout(d, "Master structural essay writing with AI!", 1700, GREEN)
    frames.append((img, 4.5))
    
    frames.append((draw_cta_slide("Frankenstein Builder", [
        "Learn Hook → Context → Thesis order",
        "Move scrambled sentences using ▲ ▼ arrows",
        "Tap Check Order to reveal academic flow"
    ]), 4.0))
    
    vo = (
        "Welcome to Frankenstein Builder! "
        "Rebuild scrambled AI essay paragraphs using the 5-part academic structure: "
        "Hook, Context, Thesis, Evidence, and Analysis! "
        "Move sentences into order, then tap Check Order to unlock your academic flow!"
    )
    build_short_video("frank", frames, vo, ROOT / "howto-frank.mp4")


# 6. TRANSITION MATCHER
def build_trans():
    frames = []
    frames.append((draw_title_slide("Transition Matcher", "Connect academic ideas", "Writing Suite", "🌉"), 3.2))
    
    # Frame 1: Slot
    img, d = new_frame()
    draw_header(d, "Transition Matcher", "Cursor AI")
    d.text((64, 180), "Connect the two statements:", font=font(38, True), fill=BLUE)
    
    rounded_rect(d, (48, 250, W - 48, 570), GREY, radius=20, outline=BLUE, width=3)
    d.text((80, 280), "RELATIONSHIP: CONTRAST", font=font(22, True), fill=RED)
    d.text((80, 330), "Online learning offers vast flexibility.", font=font(32), fill=DARK)
    d.text((80, 400), "[ Select Transition ]", font=font(34, True), fill=RED)
    d.text((80, 470), "many students struggle with discipline.", font=font(32), fill=DARK)
    
    opts = ["However", "Consequently", "Furthermore", "For instance"]
    for i, o in enumerate(opts):
        x = 48 + (i % 2) * 490
        y = 620 + (i // 2) * 160
        rounded_rect(d, (x, y, x + 450, y + 130), WHITE, radius=16, outline=BORDER)
        d.text((x + 40, y + 45), o, font=font(34, True), fill=BLUE)
        
    draw_callout(d, "Choose the discourse marker with contrast logic!")
    frames.append((img, 4.5))
    
    # Frame 2: Correct choice
    img, d = new_frame()
    draw_header(d, "Transition Matcher", "Cursor AI")
    
    rounded_rect(d, (48, 250, W - 48, 570), OK_BG, radius=20, outline=GREEN, width=4)
    d.text((80, 280), "Online learning offers vast flexibility.", font=font(32), fill=DARK)
    d.text((80, 360), "[ However ]", font=font(36, True), fill=GREEN)
    d.text((80, 440), "many students struggle with discipline.", font=font(32), fill=DARK)
    
    rounded_rect(d, (48, 620, W - 48, 780), WHITE, radius=20, outline=GREEN)
    d.text((80, 660), "✓ Excellent Match!", font=font(34, True), fill=GREEN)
    d.text((80, 710), "'However' correctly signals contrast between ideas.", font=font(28), fill=MUTED)
    
    draw_callout(d, "Strengthen sentence cohesion & flow!", 1700, GREEN)
    frames.append((img, 4.5))
    
    frames.append((draw_cta_slide("Transition Matcher", [
        "Read two academic statements",
        "Analyze contrast or cause logic needed",
        "Select discourse marker for smooth flow"
    ]), 4.0))
    
    vo = (
        "Welcome to Transition Matcher! "
        "Read two academic statements and analyze the logical relationship needed between them, like contrast or cause and effect. "
        "Choose the correct discourse marker to make your writing flow naturally!"
    )
    build_short_video("trans", frames, vo, ROOT / "howto-trans.mp4")


# 7. THE DEVIL'S ADVOCATE
def build_devil():
    frames = []
    frames.append((draw_title_slide("The Devil's Advocate", "Challenge structural arguments", "Writing Suite", "⚖️"), 3.2))
    
    # Frame 1: Thesis + Options
    img, d = new_frame()
    draw_header(d, "The Devil's Advocate", "Cursor AI")
    
    rounded_rect(d, (48, 180, W - 48, 400), WHITE, radius=20, outline=BLUE, width=3)
    d.text((80, 210), "TARGET THESIS CLAIM:", font=font(24, True), fill=RED)
    lines = wrap("AI tools should be integrated into high school writing classes.", 36)
    ty = 250
    for l in lines:
        d.text((80, ty), l, font=font(32, True), fill=DARK)
        ty += 38
        
    d.text((48, 430), "Select the strongest counter-argument:", font=font(28, True), fill=MUTED)
    
    opts = [
        "A) AI tools are expensive to maintain.",
        "B) Over-reliance weakens critical thinking and independent drafting skills.",
        "C) Students prefer traditional paper exams."
    ]
    for i, o in enumerate(opts):
        y = 480 + i * 190
        rounded_rect(d, (48, y, W - 48, y + 160), WHITE, radius=16, outline=BORDER)
        lines = wrap(o, 38)
        ty = y + 25
        for l in lines:
            d.text((70, ty), l, font=font(28, True), fill=BLUE if i == 1 else DARK)
            ty += 34
            
    draw_callout(d, "Find the objection that directly counters claim!")
    frames.append((img, 4.5))
    
    # Frame 2: Correct
    img, d = new_frame()
    draw_header(d, "The Devil's Advocate", "Cursor AI")
    
    rounded_rect(d, (48, 180, W - 48, 520), OK_BG, radius=20, outline=GREEN, width=4)
    d.text((80, 220), "✓ STRONGEST COUNTER-ARGUMENT", font=font(32, True), fill=GREEN)
    lines = wrap("Over-reliance weakens critical thinking and independent drafting skills.", 36)
    ty = 280
    for l in lines:
        d.text((80, ty), l, font=font(32, True), fill=DARK)
        ty += 38
    d.text((80, 420), "Directly counters core thesis premise with evidence.", font=font(26), fill=MUTED)
    
    draw_callout(d, "Build critical debate & writing skills!", 1700, GREEN)
    frames.append((img, 4.5))
    
    frames.append((draw_cta_slide("The Devil's Advocate", [
        "Read the target essay thesis claim",
        "Evaluate structural objections",
        "Pick strongest counter-argument to win"
    ]), 4.0))
    
    vo = (
        "Welcome to The Devil's Advocate! "
        "Challenge thesis statements to sharpen your critical writing! "
        "Read the target claim and examine the objections below. "
        "Pick the strongest structural counter-argument that directly addresses the core thesis!"
    )
    build_short_video("devil", frames, vo, ROOT / "howto-devil.mp4")


# 8. BLOAT SLASHER
def build_bloat():
    frames = []
    frames.append((draw_title_slide("Bloat Slasher", "Slash wordy academic fluff", "Writing Suite", "✂️"), 3.2))
    
    # Frame 1: Wordy sentence
    img, d = new_frame()
    draw_header(d, "Bloat Slasher", "Cursor AI")
    
    rounded_rect(d, (48, 180, W - 48, 280), WHITE, radius=16, outline=BORDER)
    d.text((80, 215), "Original: 13 | Current: 13 | Target: 5", font=font(30, True), fill=RED)
    
    rounded_rect(d, (48, 310, W - 48, 620), GREY, radius=20, outline=BLUE, width=3)
    text = "It is widely considered to be a well-known fact that reading daily improves vocabulary."
    lines = wrap(text, 36)
    ty = 350
    for l in lines:
        d.text((80, ty), l, font=font(32), fill=DARK)
        ty += 40
        
    rounded_rect(d, (48, 660, W - 48, 760), BLUE, radius=40)
    d.text((W // 2 - 140, 695), "Verify Conciseness", font=font(34, True), fill=WHITE)
    
    draw_callout(d, "Tap redundant filler words to delete them!")
    frames.append((img, 4.5))
    
    # Frame 2: Slashed sentence
    img, d = new_frame()
    draw_header(d, "Bloat Slasher", "Cursor AI")
    
    rounded_rect(d, (48, 180, W - 48, 280), OK_BG, radius=16, outline=GREEN)
    d.text((80, 215), "Original: 13 | Current: 5 | Target: 5 ✓", font=font(30, True), fill=GREEN)
    
    rounded_rect(d, (48, 310, W - 48, 620), WHITE, radius=20, outline=GREEN, width=4)
    d.text((80, 360), "✓ Daily reading improves vocabulary.", font=font(36, True), fill=GREEN)
    d.text((80, 450), "Slashed 8 wordy filler words!", font=font(30), fill=MUTED)
    
    draw_callout(d, "Crisp, concise & academic writing!", 1700, GREEN)
    frames.append((img, 4.5))
    
    frames.append((draw_cta_slide("Bloat Slasher", [
        "Read wordy academic sentence",
        "Tap redundant filler words to delete",
        "Reach target count & verify sentence"
    ]), 4.0))
    
    vo = (
        "Welcome to Bloat Slasher! "
        "Slash wordy filler to make your academic writing crisp and powerful! "
        "Read the wordy sentence, then tap redundant words to cut them away while keeping full meaning. "
        "Reach your target word count and verify your polished sentence!"
    )
    build_short_video("bloat", frames, vo, ROOT / "howto-bloat.mp4")


# 9. VOCABULARY UPGRADE
def build_vocab():
    frames = []
    frames.append((draw_title_slide("Vocabulary Upgrade", "Swap basic words for academic terms", "Writing Suite", "🔤"), 3.2))
    
    # Frame 1: Basic word
    img, d = new_frame()
    draw_header(d, "Vocabulary Upgrade", "Cursor AI")
    
    rounded_rect(d, (48, 180, W - 48, 480), WHITE, radius=20, outline=BLUE, width=3)
    d.text((80, 210), "TARGET REGISTER: FORMAL ACADEMIC", font=font(22, True), fill=RED)
    d.text((80, 260), "Upgrade basic word in sentence:", font=font(26, True), fill=MUTED)
    d.text((80, 320), "The study showed ", font=font(32), fill=DARK)
    rounded_rect(d, (360, 310, 480, 370), (255, 230, 230), radius=8, outline=RED)
    d.text((385, 320), "BIG", font=font(32, True), fill=RED)
    d.text((500, 320), "differences.", font=font(32), fill=DARK)
    
    opts = ["substantial", "nice", "kind", "huge"]
    for i, o in enumerate(opts):
        x = 48 + (i % 2) * 490
        y = 520 + (i // 2) * 150
        rounded_rect(d, (x, y, x + 450, y + 120), WHITE, radius=16, outline=BORDER)
        d.text((x + 40, y + 40), o, font=font(32, True), fill=BLUE)
        
    draw_callout(d, "Swap basic words for precise academic terms!")
    frames.append((img, 4.5))
    
    # Frame 2: Upgraded
    img, d = new_frame()
    draw_header(d, "Vocabulary Upgrade", "Cursor AI")
    
    rounded_rect(d, (48, 180, W - 48, 480), OK_BG, radius=20, outline=GREEN, width=4)
    d.text((80, 220), "✓ UPGRADED REGISTER", font=font(28, True), fill=GREEN)
    d.text((80, 280), "The study showed ", font=font(32), fill=DARK)
    rounded_rect(d, (360, 270, 620, 330), OK_BG, radius=8, outline=GREEN)
    d.text((375, 280), "SUBSTANTIAL", font=font(30, True), fill=GREEN)
    d.text((640, 280), "differences.", font=font(32), fill=DARK)
    d.text((80, 380), "'Substantial' provides formal academic precision.", font=font(26), fill=MUTED)
    
    draw_callout(d, "Elevate your writing register with AI!", 1700, GREEN)
    frames.append((img, 4.5))
    
    frames.append((draw_cta_slide("Vocabulary Upgrade", [
        "Locate highlighted basic word",
        "Choose precise academic alternative",
        "Get instant AI feedback on register"
    ]), 4.0))
    
    vo = (
        "Welcome to Vocabulary Upgrade! "
        "Transform everyday writing into formal academic language! "
        "Find the highlighted basic word in the sentence and swap it for a precise academic alternative. "
        "Get instant AI feedback explaining how your new word elevates your register!"
    )
    build_short_video("vocab", frames, vo, ROOT / "howto-vocab.mp4")


# 10. WORD-FORGED ODYSSEY
def build_odyssey():
    frames = []
    frames.append((draw_title_slide("Word-Forged Odyssey", "AI-powered text adventure", "Writing Suite", "🐉"), 3.2))
    
    # Frame 1: Scene + input
    img, d = new_frame()
    draw_header(d, "Word-Forged Odyssey", "Cursor AI")
    
    rounded_rect(d, (48, 180, W - 48, 280), WHITE, radius=16, outline=BORDER)
    d.text((70, 205), "QUEST: Infiltrate Neon Tower", font=font(26, True), fill=BLUE)
    d.text((70, 240), "REQUIRED: [ cybernetic ] [ security ] [ breach ]", font=font(22, True), fill=RED)
    
    rounded_rect(d, (48, 310, W - 48, 620), GREY, radius=20, outline=BLUE)
    lines = wrap("Guards patrol the heavy steel gate. Laser sensors sweep the entrance. How do you proceed?", 36)
    ty = 350
    for l in lines:
        d.text((70, ty), l, font=font(30), fill=DARK)
        ty += 38
        
    rounded_rect(d, (48, 650, W - 48, 850), WHITE, radius=16, outline=BLUE, width=3)
    d.text((70, 680), "I use a cybernetic pass to breach security at the main gate.|", font=font(28), fill=DARK)
    
    rounded_rect(d, (48, 880, W - 48, 980), BLUE, radius=30)
    d.text((W // 2 - 160, 915), "Submit Action to AI", font=font(32, True), fill=WHITE)
    
    draw_callout(d, "Write story actions using target vocabulary!")
    frames.append((img, 4.5))
    
    # Frame 2: AI Response
    img, d = new_frame()
    draw_header(d, "Word-Forged Odyssey", "Cursor AI")
    
    rounded_rect(d, (48, 180, W - 48, 620), OK_BG, radius=20, outline=GREEN, width=4)
    d.text((70, 220), "✓ ACTION SUCCESSFUL!", font=font(32, True), fill=GREEN)
    d.text((70, 280), "Vocab bonus unlocked: +50 XP", font=font(28, True), fill=BLUE)
    lines = wrap("The scanner blinks green. The heavy doors slide open smoothly, allowing you entry into the corridor.", 36)
    ty = 340
    for l in lines:
        d.text((70, ty), l, font=font(28), fill=DARK)
        ty += 36
        
    draw_callout(d, "AI Game Master judges logic & drives story!", 1700, GREEN)
    frames.append((img, 4.5))
    
    frames.append((draw_cta_slide("Word-Forged Odyssey", [
        "Pick your adventure quest genre",
        "Write actions using required vocab",
        "AI Game Master continues story"
    ]), 4.0))
    
    vo = (
        "Welcome to Word-Forged Odyssey! "
        "Dive into an AI-powered text adventure! "
        "Choose your genre, then write your character's next action using required target vocabulary. "
        "The AI Game Master judges your grammar and vocabulary, then drives the story forward!"
    )
    build_short_video("odyssey", frames, vo, ROOT / "howto-odyssey.mp4")


# 11. BORING TO BRILLIANT
def build_pe_boring():
    frames = []
    frames.append((draw_title_slide("Boring to Brilliant", "Upgrade bland vocabulary", "Primary English", "✨"), 3.2))
    
    # Frame 1: Prompt
    img, d = new_frame()
    draw_header(d, "Boring to Brilliant", "Cursor AI", "A1")
    
    rounded_rect(d, (48, 180, W - 48, 460), WHITE, radius=20, outline=BLUE, width=3)
    d.text((80, 215), "BLAND SENTENCE:", font=font(26, True), fill=RED)
    d.text((80, 280), "The ", font=font(32), fill=DARK)
    d.text((140, 280), "[ GOOD ]", font=font(32, True), fill=RED)
    d.text((280, 280), " dog played in the ", font=font(32), fill=DARK)
    d.text((80, 340), "[ BIG ]", font=font(32, True), fill=RED)
    d.text((180, 340), " park.", font=font(32), fill=DARK)
    
    rounded_rect(d, (48, 500, W - 48, 600), WHITE, radius=16, outline=BLUE, width=3)
    d.text((80, 535), "playful, spacious|", font=font(32), fill=DARK)
    
    rounded_rect(d, (48, 640, W - 48, 740), BLUE, radius=40)
    d.text((W // 2 - 80, 675), "Upgrade!", font=font(34, True), fill=WHITE)
    
    draw_callout(d, "Replace plain words with rich, vivid adjectives!")
    frames.append((img, 4.5))
    
    # Frame 2: Upgraded
    img, d = new_frame()
    draw_header(d, "Boring to Brilliant", "Cursor AI", "A1")
    
    rounded_rect(d, (48, 180, W - 48, 520), OK_BG, radius=20, outline=GREEN, width=4)
    d.text((80, 220), "✨ BRILLIANT UPGRADE! (+10 pts)", font=font(32, True), fill=GREEN)
    lines = wrap("The playful dog played in the spacious park.", 36)
    ty = 300
    for l in lines:
        d.text((80, ty), l, font=font(32, True), fill=DARK)
        ty += 38
    d.text((80, 420), "Vivid adjectives make your sentence shine!", font=font(26), fill=MUTED)
    
    draw_callout(d, "Earn points with richer word choices!", 1700, GREEN)
    frames.append((img, 4.5))
    
    frames.append((draw_cta_slide("Boring to Brilliant", [
        "Read bland primary English sentence",
        "Type two vivid vocabulary upgrades",
        "Click Upgrade to earn points"
    ]), 4.0))
    
    vo = (
        "Welcome to Boring to Brilliant! "
        "Upgrade bland primary English sentences into vivid writing! "
        "Read the sentence with basic words, then type two rich vocabulary upgrades. "
        "Click Upgrade to earn points and watch your writing shine!"
    )
    build_short_video("pe-boring", frames, vo, ROOT / "howto-pe-boring.mp4")


# 12. DETAIL DETECTIVE
def build_pe_detail():
    frames = []
    frames.append((draw_title_slide("Detail Detective", "Expand simple statements", "Primary English", "🔍"), 3.2))
    
    # Frame 1: Simple statement
    img, d = new_frame()
    draw_header(d, "Detail Detective", "Cursor AI", "A1")
    
    rounded_rect(d, (48, 180, W - 48, 460), WHITE, radius=20, outline=BLUE, width=3)
    d.text((80, 215), "STATEMENT: 'She bought a bag.'", font=font(30, True), fill=DARK)
    d.text((80, 280), "🔍 DETECTIVE TIP:", font=font(26, True), fill=RED)
    d.text((80, 330), "Add color & location details to expand!", font=font(28), fill=MUTED)
    
    rounded_rect(d, (48, 500, W - 48, 620), WHITE, radius=16, outline=BLUE, width=3)
    d.text((70, 540), "She bought a bright red bag at the local market.|", font=font(26), fill=DARK)
    
    rounded_rect(d, (48, 660, W - 48, 760), BLUE, radius=40)
    d.text((W // 2 - 130, 695), "Submit Evidence", font=font(34, True), fill=WHITE)
    
    draw_callout(d, "Follow clues to add color, place & evidence!")
    frames.append((img, 4.5))
    
    # Frame 2: Solved
    img, d = new_frame()
    draw_header(d, "Detail Detective", "Cursor AI", "A1")
    
    rounded_rect(d, (48, 180, W - 48, 500), OK_BG, radius=20, outline=GREEN, width=4)
    d.text((80, 220), "🔍 CASE SOLVED! (+10 pts)", font=font(32, True), fill=GREEN)
    lines = wrap("She bought a bright red bag at the local market.", 36)
    ty = 290
    for l in lines:
        d.text((80, ty), l, font=font(32, True), fill=DARK)
        ty += 38
    d.text((80, 410), "Color and location details successfully added!", font=font(26), fill=MUTED)
    
    draw_callout(d, "Expand sentences with clear evidence!", 1700, GREEN)
    frames.append((img, 4.5))
    
    frames.append((draw_cta_slide("Detail Detective", [
        "Read simple statement & detective tip",
        "Add specific details (color, place, reason)",
        "Submit evidence to solve the case"
    ]), 4.0))
    
    vo = (
        "Welcome to Detail Detective! "
        "Turn simple statements into detailed, descriptive sentences! "
        "Read the basic sentence, follow the detective clue for color, place, or reason, and type in your expanded sentence. "
        "Submit your evidence to solve the case!"
    )
    build_short_video("pe-detail", frames, vo, ROOT / "howto-pe-detail.mp4")


# 13. LINK MASTER
def build_pe_link():
    frames = []
    frames.append((draw_title_slide("Link Master", "Connect sentences smoothly", "Primary English", "🔗"), 3.2))
    
    # Frame 1: Two sentences
    img, d = new_frame()
    draw_header(d, "Link Master", "Cursor AI", "A1")
    
    rounded_rect(d, (48, 180, W - 48, 440), WHITE, radius=20, outline=BLUE, width=3)
    d.text((80, 215), "Sentence 1: It started to rain.", font=font(28, True), fill=DARK)
    d.text((80, 280), "Sentence 2: We opened our umbrellas.", font=font(28, True), fill=DARK)
    d.text((80, 350), "Join using 'because' or 'so'", font=font(24, True), fill=RED)
    
    rounded_rect(d, (48, 480, W - 48, 600), WHITE, radius=16, outline=BLUE, width=3)
    d.text((70, 520), "It started to rain, so we opened our umbrellas.|", font=font(26), fill=DARK)
    
    rounded_rect(d, (48, 640, W - 48, 740), BLUE, radius=40)
    d.text((W // 2 - 80, 675), "Connect!", font=font(34, True), fill=WHITE)
    
    draw_callout(d, "Join sentences with because/so for clear logic!")
    frames.append((img, 4.5))
    
    # Frame 2: Connected
    img, d = new_frame()
    draw_header(d, "Link Master", "Cursor AI", "A1")
    
    rounded_rect(d, (48, 180, W - 48, 480), OK_BG, radius=20, outline=GREEN, width=4)
    d.text((80, 220), "🔗 PERFECT LINK! (+10 pts)", font=font(32, True), fill=GREEN)
    lines = wrap("It started to rain, so we opened our umbrellas.", 36)
    ty = 290
    for l in lines:
        d.text((80, ty), l, font=font(32, True), fill=DARK)
        ty += 38
    d.text((80, 400), "'So' correctly expresses cause and effect.", font=font(26), fill=MUTED)
    
    draw_callout(d, "Master sentence linking words!", 1700, GREEN)
    frames.append((img, 4.5))
    
    frames.append((draw_cta_slide("Link Master", [
        "Read two separate short sentences",
        "Choose 'because' or 'so' for logic",
        "Write smooth compound sentence"
    ]), 4.0))
    
    vo = (
        "Welcome to Link Master! "
        "Join two short sentences into a smooth, connected sentence! "
        "Read both statements, choose 'because' or 'so' based on cause and effect logic, and combine them with correct punctuation. "
        "Earn points and master sentence linking!"
    )
    build_short_video("pe-link", frames, vo, ROOT / "howto-pe-link.mp4")


# 14. EXAM SIMULATOR
def build_pe_exam():
    frames = []
    frames.append((draw_title_slide("Exam Simulator", "Write exam-style emails", "Primary English", "✉️"), 3.2))
    
    # Frame 1: Task
    img, d = new_frame()
    draw_header(d, "Exam Simulator", "Cursor AI", "A1")
    
    rounded_rect(d, (48, 180, W - 48, 460), WHITE, radius=20, outline=BLUE, width=3)
    d.text((80, 210), "EXAM TASK (50–120 words):", font=font(24, True), fill=RED)
    lines = wrap("Write an email to a friend inviting them to a picnic. Include: time, place, and what food to bring.", 36)
    ty = 250
    for l in lines:
        d.text((80, ty), l, font=font(28), fill=DARK)
        ty += 34
        
    rounded_rect(d, (48, 490, W - 48, 790), WHITE, radius=16, outline=BLUE, width=3)
    d.text((70, 520), "Hi Sam! Would you like to come to a picnic", font=font(26), fill=DARK)
    d.text((70, 560), "this Saturday at 2 PM in Central Park?", font=font(26), fill=DARK)
    d.text((70, 600), "I can bring delicious sandwiches...|", font=font(26), fill=DARK)
    d.text((W - 200, 745), "Words: 58", font=font(24, True), fill=MUTED)
    
    rounded_rect(d, (48, 820, W - 48, 920), BLUE, radius=40)
    d.text((W // 2 - 200, 855), "Submit to Examiner", font=font(32, True), fill=WHITE)
    
    draw_callout(d, "Cover all bullet points within word limit!")
    frames.append((img, 4.5))
    
    # Frame 2: Feedback
    img, d = new_frame()
    draw_header(d, "Exam Simulator", "Cursor AI", "A1")
    
    rounded_rect(d, (48, 180, W - 48, 560), OK_BG, radius=20, outline=GREEN, width=4)
    d.text((80, 220), "✉️ AI EXAMINER FEEDBACK (Score: 5/5)", font=font(30, True), fill=GREEN)
    d.text((80, 290), "✓ All bullet points covered (time, place, food)", font=font(26, True), fill=DARK)
    d.text((80, 340), "✓ Friendly tone & correct opening/closing", font=font(26, True), fill=DARK)
    d.text((80, 390), "✓ Word count (58) perfectly within 50-120 range", font=font(26, True), fill=DARK)
    
    draw_callout(d, "Get instant AI examiner feedback & score!", 1700, GREEN)
    frames.append((img, 4.5))
    
    frames.append((draw_cta_slide("Exam Simulator", [
        "Read exam task & bullet points",
        "Cover all points within word limit",
        "Submit draft for AI examiner score"
    ]), 4.0))
    
    vo = (
        "Welcome to Exam Simulator! "
        "Practice writing exam-style emails with instant AI feedback! "
        "Read the task prompt, cover every required bullet point, and keep within the word limit. "
        "Submit your draft to get a complete examiner score and tips!"
    )
    build_short_video("pe-exam", frames, vo, ROOT / "howto-pe-exam.mp4")


# ==============================================================================
# MAIN EXECUTION
# ==============================================================================

def main():
    print("Building 14 upbeat, joyful, detailed LingoSpark instructional shorts...")
    
    # Vocab games
    build_flashcard()
    build_bomb()
    build_grid()
    build_auction()
    
    # Writing games
    build_frank()
    build_trans()
    build_devil()
    build_bloat()
    build_vocab()
    build_odyssey()
    
    # Primary English games
    build_pe_boring()
    build_pe_detail()
    build_pe_link()
    build_pe_exam()
    
    print("\n[ALL 14 SHORTS COMPLETED SUCCESSFULLY!]")


if __name__ == "__main__":
    main()
