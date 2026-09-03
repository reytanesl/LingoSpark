# Selling the lesson packs

Site traffic is optional. The product is a **ZIP of lists + worksheets**. Buyers paste lists into [lingospark.study](https://lingospark.study) (vocab games stay free).

Suggested prices (raise later if they sell):

| Product | TPT | Polish groups / Etsy |
|---------|-----|----------------------|
| One E8 pack (~120 terms) | **$3** | **12 zł** |
| E8 complete (14 modules) | **$29** | **99 zł** |
| One Matura PR pack (180 B2 terms) | **$4** | **16 zł** |
| Matura PR complete (14 modules) | **$39** | **149 zł** |
| Matura PP pack | **$3** | **12 zł** |
| Matura PP pair (Work + Health) | **$5** | **20 zł** |

Upload `packs/dist/LingoSpark-LS-8-COMPLETE.zip` with copy from `BUNDLE-LISTING-E8.txt`. Single modules are `LingoSpark-LS-8-*.zip`.

---

## Teachers Pay Teachers

1. Run `node packs/build.mjs`.
2. Open `packs/dist/<pack-id>/print/` — PDFs are there if Chrome/Edge was available when you ran the build; otherwise save the HTML via Ctrl+P → Save as PDF.
3. Or upload `packs/dist/LingoSpark-LS-*.zip` as-is (includes paste files + HTML + PDFs when generated).
4. Copy title, description, and tags from that pack’s `LISTING.txt`.
5. Preview images: screenshot the student matching page and the “How to paste into Bomb Defusal” section (TPT wants a thumbnail).
6. Category: World Languages → English (or EFL/ESL). Grades 7–12 for ósmoklasista; 10–12 for Matura.
7. File type: ZIP (PDF + TXT).

TPT takes a cut. You keep more on Etsy or a direct bank transfer in a Facebook group.

---

## Etsy

Same ZIP. Title from `LISTING.txt`. Digital download, instant. In the description, say they need a browser and a free LingoSpark vocab game (link the site). Do not promise Writing Suite — that is paid and not required.

---

## Polish teacher groups (Facebook, Discord, OLX)

Post in Polish. Template (edit the topic/price):

> **Ósmoklasista — 14 działów CKE, ok. 120 haseł na dział + karty do druku**
>
> Pełny komplet albo jeden dział (Człowiek, Dom, Szkoła, Praca, Życie prywatne, Żywienie, Zakupy, Podróże, Kultura, Sport, Zdrowie, Technika, Przyroda, Życie społeczne).
>
> Wklejasz listę w darmowe gry na lingospark.study (bomba, fiszki, aukcja, live quiz). Około sześć lekcji po 45 min, klucz.
>
> Cena: 12 zł / dział albo 99 zł za wszystkie 14. ZIP na maila. Licencja na jedną klasę.

Take payment via BLIK / transfer, then email the ZIP. Keep a note of who bought (so you can resend if Gmail eats it).

Do **not** dump the paste files in the public group. Sell, then send.

---

## Bundle

E8 complete: `packs/dist/LingoSpark-LS-8-COMPLETE.zip` + `BUNDLE-LISTING-E8.txt`.
Matura pair: `BUNDLE-LISTING-MATURA.txt`.

---

## After you have a live listing

Put the TPT/Etsy URL in the About panel on the site (search for “Teachers: exam vocab packs”) and in this file. Until then, `karolsenk@gmail.com` is the buy link.

---

## What not to do

- Do not add these JSON lists to `demo-sets.js` (that would give the product away).
- Do not sell the site’s free Matura “Człowiek” demo lists — the paid E8 Człowiek pack is a different Grade-8 list.
- Do not put ads in the student PDFs.
- Keep Primary English as an optional upsell in the teacher guide only; the pack works without it.
