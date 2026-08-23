const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dataDir = path.join(root, "data");

function loadJson(name) {
    return JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8"));
}

function toEntry(row) {
    if (!row) return null;
    const term = String(row[0] || "").trim().toLowerCase();
    const definition = String(row[1] || "").trim();
    const example = String(row[2] || "").trim();
    if (!term || !definition) return null;
    return { term, definition, example };
}

function uniqueMerge(lists, limit) {
    const seen = new Set();
    const out = [];
    for (const list of lists) {
        for (const row of list) {
            const entry = toEntry(row);
            if (!entry) continue;
            if (seen.has(entry.term)) continue;
            seen.add(entry.term);
            out.push(entry);
            if (limit && out.length >= limit) return out;
        }
    }
    return out;
}

const beginnerDrop = new Set([
    "be", "hello", "goodbye", "please", "thanks", "yes", "no",
    "monday", "friday", "sunday", "minute", "hour", "come"
]);

const beginnerRaw = loadJson("auction-beginner.json").filter((row) => {
    const t = String(row[0] || "").trim().toLowerCase();
    return t && !beginnerDrop.has(t);
});

const beginner = uniqueMerge([beginnerRaw], 150);
const easy = uniqueMerge([
    loadJson("auction-easy-1.json"),
    loadJson("auction-easy-2.json"),
    loadJson("auction-easy-fill.json")
], 500);
const intermediate = uniqueMerge([
    loadJson("auction-int-1.json"),
    loadJson("auction-int-2.json"),
    loadJson("auction-int-3.json"),
    loadJson("auction-int-4.json"),
    loadJson("auction-int-fill.json")
], 2000);
const advanced = uniqueMerge([
    loadJson("auction-adv-1.json"),
    loadJson("auction-adv-2.json"),
    loadJson("auction-adv-fill.json")
], 1000);

const counts = {
    beginner: beginner.length,
    easy: easy.length,
    intermediate: intermediate.length,
    advanced: advanced.length
};
console.log("counts", counts);

const expected = { beginner: 150, easy: 500, intermediate: 2000, advanced: 1000 };
const short = Object.entries(expected).filter(([k, n]) => counts[k] !== n);
if (short.length) {
    console.error("COUNT MISMATCH", short);
    process.exit(1);
}

const shoe = beginner.find((e) => e.term === "shoe");
if (!shoe) {
    console.error("missing beginner shoe");
    process.exit(1);
}
console.log("shoe:", shoe.definition);

const bank = { beginner, easy, intermediate, advanced };
const js = `/* Vocab Auction local term bank — generated, do not edit by hand. */\nwindow.VOCAB_AUCTION_BANK = ${JSON.stringify(bank)};\n`;
const outPath = path.join(root, "vocab-auction-bank.js");
fs.writeFileSync(outPath, js);
console.log("wrote", outPath, "bytes", js.length);
