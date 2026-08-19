"""Generate a light, upbeat royalty-free BGM bed (stdlib only)."""
from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

OUT = Path(__file__).resolve().parent / "bgm_frankenstein_howto.wav"
SAMPLE_RATE = 44100
DURATION = 55.0  # enough for padded howto

# C major cheerful motif (Hz)
NOTES = {
    "C4": 261.63,
    "D4": 293.66,
    "E4": 329.63,
    "F4": 349.23,
    "G4": 392.00,
    "A4": 440.00,
    "B4": 493.88,
    "C5": 523.25,
    "D5": 587.33,
    "E5": 659.25,
    "G5": 783.99,
    "REST": 0.0,
}

# Light bounce pattern — ~120 BPM feel (0.25s sixteenth-ish units)
# Pattern loops: bright, friendly, not aggressive
MELODY = [
    ("E5", 0.25), ("G5", 0.25), ("C5", 0.25), ("G5", 0.25),
    ("E5", 0.25), ("D5", 0.25), ("C5", 0.5),
    ("D5", 0.25), ("E5", 0.25), ("G5", 0.25), ("E5", 0.25),
    ("D5", 0.5), ("REST", 0.25), ("G4", 0.25),
    ("C5", 0.25), ("E5", 0.25), ("G5", 0.25), ("E5", 0.25),
    ("A4", 0.25), ("C5", 0.25), ("E5", 0.5),
    ("G4", 0.25), ("B4", 0.25), ("D5", 0.25), ("B4", 0.25),
    ("C5", 0.5), ("REST", 0.5),
]

BASS = [
    ("C4", 1.0), ("G4", 1.0), ("A4", 1.0), ("F4", 1.0),
]


def env(i: int, n: int, attack=0.02, release=0.08) -> float:
    if n <= 0:
        return 0.0
    t = i / n
    a = min(1.0, t / attack) if attack > 0 else 1.0
    r = min(1.0, (1.0 - t) / release) if release > 0 else 1.0
    return max(0.0, min(1.0, a * r))


def tone(freq: float, seconds: float, amp: float = 0.18, soft: bool = True) -> list[float]:
    n = int(SAMPLE_RATE * seconds)
    out = [0.0] * n
    if freq <= 0:
        return out
    for i in range(n):
        t = i / SAMPLE_RATE
        # soft triangle-ish + quiet sine = gentle "pluck"
        phase = 2 * math.pi * freq * t
        tri = (2 / math.pi) * math.asin(math.sin(phase))
        sine = math.sin(phase)
        wave_s = 0.55 * sine + 0.45 * tri if soft else sine
        out[i] = amp * wave_s * env(i, n)
    return out


def chord(freqs: list[float], seconds: float, amp: float = 0.06) -> list[float]:
    n = int(SAMPLE_RATE * seconds)
    out = [0.0] * n
    for f in freqs:
        part = tone(f, seconds, amp=amp / max(1, len(freqs)), soft=True)
        for i in range(n):
            out[i] += part[i]
    return out


def extend(buf: list[float], add: list[float], at: int):
    end = at + len(add)
    if end > len(buf):
        buf.extend([0.0] * (end - len(buf)))
    for i, v in enumerate(add):
        buf[at + i] += v


def build() -> list[float]:
    total = int(SAMPLE_RATE * DURATION)
    buf = [0.0] * total
    pos = 0
    loop = 0
    while pos < total:
        # pad chord underneath each 4-beat chunk
        bar = 2.0
        root_cycle = [
            [NOTES["C4"], NOTES["E4"], NOTES["G4"]],
            [NOTES["G4"], NOTES["B4"], NOTES["D5"]],
            [NOTES["A4"], NOTES["C5"], NOTES["E5"]],
            [NOTES["F4"], NOTES["A4"], NOTES["C5"]],
        ]
        ch = root_cycle[loop % 4]
        extend(buf, chord(ch, bar, amp=0.045), pos)

        # bass pulse
        bass_note = BASS[loop % len(BASS)][0]
        extend(buf, tone(NOTES[bass_note], bar, amp=0.07, soft=True), pos)

        # melody
        mpos = pos
        for name, dur in MELODY:
            if mpos >= total:
                break
            extend(buf, tone(NOTES[name], dur, amp=0.16, soft=True), mpos)
            mpos += int(dur * SAMPLE_RATE)

        # light high sparkle every other loop
        if loop % 2 == 0:
            sparkle = [
                ("G5", 0.125), ("E5", 0.125), ("C5", 0.125), ("REST", 0.125),
                ("E5", 0.125), ("G5", 0.125), ("C5", 0.25),
            ]
            spos = pos + int(0.5 * SAMPLE_RATE)
            for name, dur in sparkle:
                extend(buf, tone(NOTES[name], dur, amp=0.08, soft=True), spos)
                spos += int(dur * SAMPLE_RATE)

        pos += int(bar * SAMPLE_RATE)
        loop += 1

    # soft fade in/out
    fade = int(SAMPLE_RATE * 1.2)
    for i in range(fade):
        buf[i] *= i / fade
        buf[-1 - i] *= i / fade

    # gentle limiter
    peak = max(abs(x) for x in buf) or 1.0
    scale = 0.72 / peak
    return [x * scale for x in buf]


def write_wav(samples: list[float], path: Path):
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for s in samples:
            v = max(-1.0, min(1.0, s))
            frames += struct.pack("<h", int(v * 32767))
        w.writeframes(frames)


if __name__ == "__main__":
    data = build()
    write_wav(data, OUT)
    print(f"BGM written: {OUT} ({DURATION:.0f}s)")
