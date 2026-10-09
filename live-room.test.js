// Static guards for the Live Spark room / phone / reset screens (no browser needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('./live-room.css', import.meta.url), 'utf8');
const count = (id) => html.split(`id="${id}"`).length - 1;

test('every element the Live client drives still exists exactly once', () => {
    const ids = [
        // host room
        'screen-live-host', 'live-host-room-panel', 'live-host-code', 'live-host-join-link', 'live-host-qr', 'live-host-player-count',
        'live-host-answer-mode', 'live-host-lobby-settings', 'live-host-lobby-cannon-row', 'live-lobby-game-minutes', 'live-host-lobby-lantern-row',
        'live-lobby-rounds', 'live-host-lobby-team-row', 'live-host-lobby-time-row', 'live-lobby-question-time', 'live-lobby-question-time-hint',
        'live-host-game-panel', 'live-host-status', 'live-host-progress-board', 'live-host-start', 'live-host-play-again', 'live-host-end',
        'live-host-race', 'live-host-lanterns', 'live-host-cannon', 'live-host-challenge-panel', 'll-lobby-title', 'wc-lobby-title', 'lsr-format-pill',
        // phone
        'screen-live-play', 'live-play-nickname', 'live-play-fullscreen-btn', 'lsp-room-code', 'lsp-you', 'lsp-you-buddy', 'lsp-you-name',
        'live-play-hero', 'live-play-progress-label', 'live-play-progress-bar', 'live-play-room-code', 'live-play-status', 'live-play-roster',
        'live-play-team-lobby', 'live-play-team-list', 'live-play-create-team', 'live-play-timer', 'live-play-timeup', 'live-play-definition',
        'live-play-crew-role', 'live-play-choices', 'live-play-crew-panel', 'live-play-crew-votes', 'live-play-captain-submit',
        'live-play-type-section', 'live-play-answer', 'live-play-crew-vote-btn', 'live-play-submit', 'live-play-result',
        'live-play-challenge-actions', 'live-play-champion', 'live-play-lantern', 'll-player-lobby', 'live-play-cannon', 'wc-player-lobby',
        // forgot / reset
        'lse-forgot-link', 'lse-forgot-form', 'lse-forgot-email', 'lse-forgot-btn', 'lse-forgot-back', 'auth-forgot-link', 'auth-forgot-form',
        'auth-forgot-email', 'screen-reset-password', 'rp-form', 'rp-password', 'rp-confirm', 'rp-submit', 'rp-invalid', 'rp-done', 'rp-signin',
    ];
    for (const id of ids) assert.equal(count(id), 1, `#${id}`);
    for (const fmt of ['race', 'captain-crew', 'hot-spark-relay', 'lucky-lanterns', 'word-cannon']) {
        assert.ok(html.includes(`name="live-lobby-format" value="${fmt}"`), fmt);
    }
});

test('live-room.css loads after the inline styles so it wins ties', () => {
    const styleEnd = html.indexOf('</style>');
    const link = html.indexOf('href="live-room.css"');
    assert.ok(link > styleEnd && link < html.indexOf('</head>'));
    assert.ok(html.indexOf('src="password-reset-client.js"') > 0);
});

test('host room never creates a containing block for the fixed game overlays', () => {
    // transform / filter / contain on #screen-live-host would trap the fixed race / lantern / cannon overlays.
    const hostRules = css.split('}').filter((r) => /#screen-live-host\.live-room(\.active)?\s*\{/.test(r) || /#screen-live-host\.live-room\.active\s*\{/.test(r));
    assert.ok(hostRules.length > 0);
    for (const r of hostRules) assert.ok(!/\b(transform|filter|contain|perspective)\s*:/.test(r), r);
});

test('phone question UI keeps hidden controls hidden', () => {
    for (const id of ['live-play-definition', 'live-play-type-section', 'live-play-choices', 'live-play-submit', 'live-play-captain-submit', 'live-play-crew-vote-btn', 'live-play-create-team']) {
        assert.ok(css.includes(`#${id}[hidden]`), `#${id}[hidden] rule`);
    }
});
