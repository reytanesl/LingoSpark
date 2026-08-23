const fs = require("fs");
const path = require("path");
const vm = require("vm");

const bankSrc = fs.readFileSync(path.join(__dirname, "..", "vocab-auction-bank.js"), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(bankSrc, sandbox);
const bank = sandbox.window.VOCAB_AUCTION_BANK;
const levels = ["beginner", "easy", "intermediate", "advanced"];
const expected = { beginner: 150, easy: 500, intermediate: 2000, advanced: 1000 };

for (const level of levels) {
    const list = bank[level];
    const terms = list.map((e) => e.term.toLowerCase());
    const unique = new Set(terms);
    if (list.length !== expected[level] || unique.size !== expected[level]) {
        console.error("count fail", level, list.length, unique.size);
        process.exit(1);
    }
    const missing = list.filter((e) => !e.definition || !e.example);
    if (missing.length) {
        console.error("missing fields", level, missing.slice(0, 3));
        process.exit(1);
    }
}

const shoe = bank.beginner.find((e) => e.term === "shoe");
console.log("beginner shoe:", shoe);
console.log("easy sample:", bank.easy[0]);
console.log("int sample:", bank.intermediate.find((e) => e.term.includes(" ")) || bank.intermediate[0]);
console.log("adv sample:", bank.advanced[0]);
console.log("OK", expected);

const html = fs.readFileSync(path.join(__dirname, "..", "vocab-auction.html"), "utf8");
if (html.includes("dictionaryapi.dev") || html.includes("wiktionary")) {
    console.error("API leftovers in HTML");
    process.exit(1);
}
if (!html.includes("vocab-auction-bank.js")) {
    console.error("bank script missing");
    process.exit(1);
}

const start = html.indexOf("<script src=\"vocab-auction-bank.js\"></script>");
const inline = html.indexOf("<script>", start);
const end = html.lastIndexOf("</script>");
const script = html.slice(inline + 8, end);
try {
    new vm.Script(script, { filename: "vocab-auction.html" });
    console.log("HTML script parsed OK");
} catch (err) {
    console.error("HTML script syntax error", err);
    process.exit(1);
}
