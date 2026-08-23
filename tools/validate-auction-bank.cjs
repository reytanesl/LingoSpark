const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "data");
const files = fs.readdirSync(dir).filter((f) => f.startsWith("auction-") && f.endsWith(".json"));

function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function leaks(def, term) {
    const w = term.toLowerCase().replace(/[^a-z'-]/g, " ").trim();
    if (!w) return "empty";
    const d = def.toLowerCase();
    if (new RegExp("\\b" + escapeRe(w) + "\\b").test(d)) return "exact";
    const parts = w.split(/\s+/).filter((p) => p.length >= 5);
    for (const p of parts) {
        if (new RegExp("\\b" + escapeRe(p) + "\\b").test(d)) return "part:" + p;
    }
    return null;
}

for (const f of files) {
    const raw = fs.readFileSync(path.join(dir, f), "utf8");
    let data;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        console.log(f, "INVALID JSON", e.message);
        continue;
    }
    const terms = [];
    const issues = [];
    data.forEach((row, i) => {
        if (!Array.isArray(row) || row.length < 3) {
            issues.push("bad row " + i);
            return;
        }
        const [t, d, e] = row.map(String);
        const key = t.trim().toLowerCase();
        terms.push(key);
        if (!d.trim() || !e.trim()) issues.push("empty " + key);
        if (!e.toLowerCase().includes(key)) issues.push("ex miss:" + key);
        const L = leaks(d, key);
        if (L) issues.push("leak " + L + " " + key);
    });
    const dups = [...new Set(terms.filter((t, i) => terms.indexOf(t) !== i))];
    console.log(f, "n=" + data.length, "unique=" + new Set(terms).size, "dups=" + dups.length, "issues=" + issues.length);
    if (dups.length) console.log("  dups sample", dups.slice(0, 12));
    if (issues.length) console.log("  issues sample", issues.slice(0, 20));
}

// cross-file unique within level groups
function load(name) {
    return JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
}
function keys(rows) {
    return rows.map((r) => String(r[0]).trim().toLowerCase());
}
const easy = [...load("auction-easy-1.json"), ...load("auction-easy-2.json")];
const inter = [...load("auction-int-1.json"), ...load("auction-int-2.json"), ...load("auction-int-3.json"), ...load("auction-int-4.json")];
const adv = [...load("auction-adv-1.json"), ...load("auction-adv-2.json")];
function report(label, rows) {
    const k = keys(rows);
    console.log("\nGROUP", label, "raw=" + rows.length, "unique=" + new Set(k).size);
}
report("easy", easy);
report("intermediate", inter);
report("advanced", adv);

const easySet = new Set(keys(easy));
const intSet = new Set(keys(inter));
const advSet = new Set(keys(adv));
const begSet = new Set(keys(load("auction-beginner.json")));
function overlap(a, b, an, bn) {
    let n = 0;
    for (const x of a) if (b.has(x)) n++;
    console.log("overlap", an, bn, n);
}
overlap(begSet, easySet, "beg", "easy");
overlap(begSet, intSet, "beg", "int");
overlap(easySet, intSet, "easy", "int");
overlap(intSet, advSet, "int", "adv");
overlap(easySet, advSet, "easy", "adv");
