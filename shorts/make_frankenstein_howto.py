"""
Render an instructional Frankenstein Builder UI simulation (1080x1920)
and stitch it into an MP4 with English voiceover.
"""
from __future__ import annotations

import math
import os
import subprocess
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
FRAMES = ROOT / "frankenstein_howto_frames"
OUT_MP4 = ROOT / "frankenstein-howto.mp4"
VO_WAV = ROOT / "vo_frankenstein_howto.wav"
FFMPEG = Path(
    r"C:\Users\karol\AppData\Local\Microsoft\WinGet\Packages"
    r"\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe"
    r"\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"
)

W, H = 1080, 1920
BLUE = (1, 33, 105)
RED = (200, 16, 46)
GREEN = (0, 130, 59)
WHITE = (255, 255, 255)
GREY = (244, 245, 247)
MUTED = (90, 90, 90)
DARK = (45, 45, 45)
BORDER = (224, 224, 224)
OK_BG = (232, 245, 233)

SENTENCES = [
    {
        "id": 1,
        "role": "Hook",
        "text": "What if the most powerful tool in a classroom was silence?",
    },
    {
        "id": 2,
        "role": "Context",
        "text": "Debates about phones in schools have divided teachers and parents.",
    },
    {
        "id": 3,
        "role": "Thesis",
        "text": "Schools should ban smartphones in lessons to protect concentration.",
    },
    {
        "id": 4,
        "role": "Evidence",
        "text": "A 2023 study found students scored 12% higher in phone-free rooms.",
    },
    {
        "id": 5,
        "role": "Analysis",
        "text": "This suggests attention, not apps, drives real learning gains.",
    },
]

# Scrambled start → step-by-step corrections toward 1,2,3,4,5
ORDERS = [
    [3, 1, 5, 2, 4],  # scrambled
    [1, 3, 5, 2, 4],  # move Hook up
    [1, 3, 2, 5, 4],  # Context up
    [1, 2, 3, 5, 4],  # Thesis into place
    [1, 2, 3, 4, 5],  # Evidence / Analysis fixed
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\calibrib.ttf" if bold else r"C:\Windows\Fonts\calibri.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def rounded_rect(draw: ImageDraw.ImageDraw, box, fill, radius=18, outline=None, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def wrap(text: str, width: int = 34) -> list[str]:
    return textwrap.wrap(text, width=width) or [""]


def by_id(order: list[int]) -> list[dict]:
    lookup = {s["id"]: s for s in SENTENCES}
    return [lookup[i] for i in order]


def draw_chrome(draw: ImageDraw.ImageDraw, title: str, step_label: str):
    # Header bar
    rounded_rect(draw, (48, 48, W - 48, 150), WHITE, radius=16, outline=BORDER, width=2)
    draw.text((72, 72), "← Exit", font=font(28), fill=MUTED)
    draw.text((W // 2 - 210, 68), "Frankenstein Builder", font=font(34, True), fill=BLUE)
    draw.rounded_rectangle((760, 70, 1000, 118), radius=20, fill=RED)
    draw.text((792, 78), "Cursor AI", font=font(24, True), fill=WHITE)

    # Title / step
    draw.text((64, 180), title, font=font(46, True), fill=BLUE)
    draw.text((64, 240), step_label, font=font(30), fill=RED)

    # Structure strip
    rounded_rect(draw, (48, 300, W - 48, 400), GREY, radius=14, outline=BLUE, width=3)
    draw.text((72, 318), "Correct order", font=font(24, True), fill=BLUE)
    draw.text((72, 354), "Hook → Context → Thesis → Evidence → Analysis", font=font(26, True), fill=DARK)


def draw_cards(
    draw: ImageDraw.ImageDraw,
    order: list[int],
    *,
    highlight_idx: int | None = None,
    show_roles: bool = False,
    pulse_arrows_on: int | None = None,
    y0: int = 440,
):
    cards = by_id(order)
    card_h = 175
    gap = 18
    for i, s in enumerate(cards):
        y = y0 + i * (card_h + gap)
        fill = WHITE
        outline = BORDER
        ow = 2
        if highlight_idx == i:
            outline = BLUE
            ow = 4
            fill = (235, 240, 255)
        if show_roles and order == [1, 2, 3, 4, 5]:
            outline = GREEN
            ow = 3
            fill = OK_BG
        rounded_rect(draw, (48, y, W - 48, y + card_h), fill, radius=14, outline=outline, width=ow)

        label = s["role"] if show_roles else f"Sentence {i + 1}"
        draw.text((72, y + 18), label, font=font(22, True), fill=RED if not show_roles else GREEN)

        lines = wrap(s["text"], 36)
        ty = y + 58
        for line in lines[:3]:
            draw.text((72, ty), line, font=font(28), fill=DARK)
            ty += 34

        # Arrow controls
        ax = W - 170
        ay = y + 40
        up_fill = BLUE if pulse_arrows_on == i else GREY
        down_fill = BLUE if pulse_arrows_on == i else GREY
        rounded_rect(draw, (ax, ay, ax + 90, ay + 44), up_fill, radius=8)
        rounded_rect(draw, (ax, ay + 56, ax + 90, ay + 100), down_fill, radius=8)
        draw.text((ax + 30, ay + 4), "▲", font=font(28, True), fill=WHITE if pulse_arrows_on == i else BLUE)
        draw.text((ax + 30, ay + 60), "▼", font=font(28, True), fill=WHITE if pulse_arrows_on == i else BLUE)


def draw_check_button(draw: ImageDraw.ImageDraw, *, pressed: bool = False, y: int = 1470):
    fill = (0, 18, 80) if pressed else BLUE
    rounded_rect(draw, (48, y, W - 48, y + 100), fill, radius=40)
    label = "Check Order"
    f = font(36, True)
    bbox = draw.textbbox((0, 0), label, font=f)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw) / 2, y + 28), label, font=f, fill=WHITE)


def draw_feedback(draw: ImageDraw.ImageDraw, text: str, ok: bool = True):
    color = GREEN if ok else RED
    draw.text((64, 1600), text, font=font(40, True), fill=color)


def draw_callout(draw: ImageDraw.ImageDraw, text: str, y: int = 1720):
    rounded_rect(draw, (48, y, W - 48, y + 120), BLUE, radius=16)
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


def save(img: Image.Image, name: str):
    FRAMES.mkdir(parents=True, exist_ok=True)
    path = FRAMES / name
    img.save(path, "PNG", optimize=True)
    return path


def make_frames() -> list[tuple[Path, float]]:
    """Return list of (frame_path, duration_seconds)."""
    seq: list[tuple[Path, float]] = []

    # 1) Title
    img, d = new_frame()
    d.text((W // 2 - 220, 620), "LingoSpark", font=font(54, True), fill=BLUE)
    d.text((90, 740), "How to play", font=font(72, True), fill=DARK)
    d.text((90, 840), "Frankenstein Builder", font=font(56, True), fill=RED)
    rounded_rect(d, (90, 980, W - 90, 1180), WHITE, radius=20, outline=BLUE, width=4)
    d.text((130, 1030), "Instructional simulation", font=font(36, True), fill=BLUE)
    d.text((130, 1095), "Put five AI sentences into the", font=font(32), fill=MUTED)
    d.text((130, 1140), "correct essay structure.", font=font(32), fill=MUTED)
    seq.append((save(img, "01_title.png"), 3.2))

    # 2) Goal + structure
    img, d = new_frame()
    draw_chrome(d, "Your mission", "Learn the structure first")
    roles = ["1. Hook", "2. Context", "3. Thesis", "4. Evidence", "5. Analysis"]
    tips = [
        "Grab attention",
        "Set the background",
        "State your claim",
        "Give proof / example",
        "Explain why it matters",
    ]
    for i, (role, tip) in enumerate(zip(roles, tips)):
        y = 440 + i * 160
        rounded_rect(d, (48, y, W - 48, y + 140), WHITE, radius=14, outline=BORDER, width=2)
        d.ellipse((72, y + 36, 148, y + 112), fill=BLUE if i % 2 == 0 else RED)
        d.text((96, y + 52), str(i + 1), font=font(36, True), fill=WHITE)
        d.text((180, y + 36), role, font=font(36, True), fill=BLUE)
        d.text((180, y + 88), tip, font=font(28), fill=MUTED)
    draw_callout(d, "Memorise this flow — then rebuild it.")
    seq.append((save(img, "02_structure.png"), 4.5))

    # 3) Scrambled board
    img, d = new_frame()
    draw_chrome(d, "AI gives you 5 sentences", "But they arrive scrambled")
    draw_cards(d, ORDERS[0], highlight_idx=None)
    draw_check_button(d)
    draw_callout(d, "Wrong order on purpose — now fix it.")
    seq.append((save(img, "03_scrambled.png"), 3.8))

    # 4) Highlight controls
    img, d = new_frame()
    draw_chrome(d, "How to move a sentence", "Tap ▲ or ▼ on the right")
    draw_cards(d, ORDERS[0], pulse_arrows_on=0, highlight_idx=0)
    draw_check_button(d)
    draw_callout(d, "Move cards until the logic flows.")
    seq.append((save(img, "04_controls.png"), 3.6))

    # 5-8) Reorder steps
    move_notes = [
        "Bring the Hook to the top",
        "Slide Context under the Hook",
        "Place Thesis in the middle",
        "Finish with Evidence → Analysis",
    ]
    for i, order in enumerate(ORDERS[1:]):
        img, d = new_frame()
        draw_chrome(d, f"Reorder · step {i + 1}/4", move_notes[i])
        # highlight the card that just moved into a better place
        highlight = i  # rough
        draw_cards(d, order, highlight_idx=min(highlight, 4), pulse_arrows_on=min(highlight, 4))
        draw_check_button(d)
        draw_callout(d, "Keep adjusting until it reads like an essay.")
        seq.append((save(img, f"05_move_{i + 1}.png"), 2.8))

    # 9) Check
    img, d = new_frame()
    draw_chrome(d, "Ready to check?", "Tap Check Order")
    draw_cards(d, ORDERS[-1], show_roles=False)
    draw_check_button(d, pressed=True)
    draw_callout(d, "The game marks the rhetorical order.")
    seq.append((save(img, "06_check.png"), 2.8))

    # 10) Success with roles revealed
    img, d = new_frame()
    draw_chrome(d, "Correct!", "You rebuilt the paragraph")
    draw_cards(d, ORDERS[-1], show_roles=True)
    draw_feedback(d, "Perfect order — academic flow unlocked.", ok=True)
    draw_callout(d, "Try a new paragraph anytime.")
    seq.append((save(img, "07_success.png"), 4.0))

    # 11) CTA
    img, d = new_frame()
    d.text((90, 620), "Now you know", font=font(42), fill=MUTED)
    d.text((90, 700), "Frankenstein Builder", font=font(58, True), fill=BLUE)
    rounded_rect(d, (90, 860, W - 90, 1180), WHITE, radius=20, outline=RED, width=4)
    steps = [
        "1. Read the target structure",
        "2. Move sentences with ▲ ▼",
        "3. Check Order — learn from feedback",
    ]
    for i, line in enumerate(steps):
        d.text((130, 920 + i * 70), line, font=font(34, True), fill=DARK)
    rounded_rect(d, (90, 1320, W - 90, 1480), BLUE, radius=24)
    d.text((200, 1375), "Play at lingospark.study", font=font(40, True), fill=WHITE)
    d.text((90, 1580), "Writing Suite · LingoSpark", font=font(32), fill=MUTED)
    seq.append((save(img, "08_cta.png"), 4.0))

    return seq


def write_concat(seq: list[tuple[Path, float]]) -> Path:
    concat = FRAMES / "concat.txt"
    lines = []
    for path, dur in seq:
        # ffmpeg concat demuxer wants forward slashes
        p = path.as_posix().replace("'", r"'\''")
        lines.append(f"file '{p}'")
        lines.append(f"duration {dur:.2f}")
    # last file must be repeated without duration for concat demuxer
    last = seq[-1][0].as_posix()
    lines.append(f"file '{last}'")
    concat.write_text("\n".join(lines), encoding="utf-8")
    return concat


def make_voiceover():
    """Generate WAV via PowerShell System.Speech (British Hazel — soft)."""
    text = (
        "How to play Frankenstein Builder. "
        "First, gently learn the essay structure: Hook, Context, Thesis, Evidence, Analysis. "
        "The AI gives you five sentences, but they arrive a little scrambled — that's okay. "
        "Use the up and down arrows to move each sentence, nice and steady. "
        "Keep reordering until the paragraph flows naturally. "
        "Then tap Check Order. "
        "If you are correct, you unlock that lovely academic flow. "
        "Try it now at lingospark.study."
    )
    ps = f"""
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = -2
$synth.Volume = 88
try {{ $synth.SelectVoice('Microsoft Hazel Desktop') }} catch {{ $synth.SelectVoice('Microsoft Zira Desktop') }}
$synth.SetOutputToWaveFile('{VO_WAV.as_posix()}')
$synth.Speak(@'
{text}
'@)
$synth.Dispose()
Write-Host 'VO done'
"""
    subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps],
        check=True,
    )


def stitch(concat: Path):
    # Build silent video from stills, then mux VO (shortest / pad)
    silent = FRAMES / "silent.mp4"
    cmd1 = [
        str(FFMPEG),
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(concat),
        "-vf",
        "fps=30,format=yuv420p",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        str(silent),
    ]
    subprocess.run(cmd1, check=True)

    cmd2 = [
        str(FFMPEG),
        "-y",
        "-i",
        str(silent),
        "-i",
        str(VO_WAV),
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        str(OUT_MP4),
    ]
    subprocess.run(cmd2, check=True)


def main():
    print("Rendering frames...")
    seq = make_frames()
    total = sum(d for _, d in seq)
    print(f"  {len(seq)} frames, ~{total:.1f}s visual timeline")
    concat = write_concat(seq)
    print("Generating voiceover...")
    make_voiceover()
    print("Stitching MP4...")
    stitch(concat)
    print(f"Done: {OUT_MP4}")


if __name__ == "__main__":
    main()
