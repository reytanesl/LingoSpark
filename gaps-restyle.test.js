import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('Advanced Text Gaps + E8 Text Gaps reuse the own-time tokens (restyle is CSS-only and scoped)', () => {
    assert.match(html, /#screen-own-time, #screen-adv-gaps, #screen-pe-e8-gaps \{ --ot-navy:/);
    assert.match(html, /:is\(#screen-adv-gaps, #screen-pe-e8-gaps\) \.e8-gaps-text \{/);
    assert.match(html, /:is\(#screen-adv-gaps, #screen-pe-e8-gaps\) \.gaps-exam-task \{[^}]*var\(--ot-accent\)/);
    assert.match(html, /:is\(#screen-adv-gaps, #screen-pe-e8-gaps\) \.feedback\.success/);
    // Markup/logic untouched: inputs and check buttons keep their ids and handlers.
    assert.match(html, /onclick="checkAdvGaps\(\)" id="adv-gaps-check"/);
    assert.match(html, /onclick="checkPeE8Gaps\(\)" id="pe-e8-gaps-check"/);
});
