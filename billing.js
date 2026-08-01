import crypto from 'crypto';
import { grantBmcAccessByEmail, revokeBmcAccessByEmail } from './db.js';

/** $3 ≈ 1 week; $10 ≈ 1 month (Writing Suite + Primary English). BMC is USD-only. */
const WEEK_DAYS = 7;
const MONTH_DAYS = 30;
const WEEK_AMOUNT = 3;
const MONTH_AMOUNT = 10;

function payloadRoots(payload) {
    const data = payload?.data || payload || {};
    return [data, data.response, data.purchase, data.membership, data.donation, data.extra, payload].filter(
        (x) => x && typeof x === 'object'
    );
}

function extractEmail(payload) {
    for (const data of payloadRoots(payload)) {
        const email =
            data.supporter_email ||
            data.payer_email ||
            data.email ||
            data.member_email ||
            data.buyer_email ||
            data?.supporter?.email ||
            data?.member?.email ||
            data?.payer?.email;
        if (email) return String(email).toLowerCase().trim();
    }
    return '';
}

function extractMembershipId(payload) {
    for (const data of payloadRoots(payload)) {
        const id = data.membership_id || data.subscription_id || data.purchase_id || data.id;
        if (id != null && id !== '') return String(id);
    }
    return null;
}

function extractAmount(payload) {
    for (const data of payloadRoots(payload)) {
        const raw =
            data.amount ??
            data.total_amount ??
            data.purchase_amount ??
            data.support_coffee_price ??
            data.coffee_price ??
            data.price ??
            data.membership_price ??
            data.usd_amount ??
            data.unit_price;
        if (raw == null || raw === '') continue;
        const n = Number(String(raw).replace(/[^0-9.]/g, ''));
        if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
}

function extractTitle(payload) {
    for (const data of payloadRoots(payload)) {
        const title =
            data.reward_title ||
            data.title ||
            data.name ||
            data.membership_level_name ||
            data.extra_title ||
            data?.reward?.title ||
            data?.extra?.title ||
            data?.membership?.name;
        if (title) return String(title);
    }
    return '';
}

/**
 * Map payment → access days.
 * Prefer product title hints, then amount near $3 / $10, then event-type default.
 */
export function resolveAccessDays(payload, eventType = '') {
    const title = extractTitle(payload).toLowerCase();
    const amount = extractAmount(payload);
    const type = String(eventType || '').toLowerCase();

    if (
        /\bweek\b/.test(title) ||
        /\b7\s*days?\b/.test(title) ||
        /\$?\s*3\b/.test(title) ||
        /\b3\s*(usd|dollars?|\$)\b/.test(title)
    ) {
        return WEEK_DAYS;
    }
    if (
        /\bmonth\b/.test(title) ||
        /\b30\s*days?\b/.test(title) ||
        /\$?\s*10\b/.test(title) ||
        /\b10\s*(usd|dollars?|\$)\b/.test(title)
    ) {
        return MONTH_DAYS;
    }

    if (amount != null) {
        // ~$10 → month; ~$3 → week (check month first so $10 is not treated as week)
        if (Math.abs(amount - MONTH_AMOUNT) <= 2 || (amount >= 8 && amount <= 15)) {
            return MONTH_DAYS;
        }
        if (Math.abs(amount - WEEK_AMOUNT) <= 1.5 || (amount >= 1 && amount < 8)) {
            return WEEK_DAYS;
        }
    }

    // Recurring membership / monthly support without clear amount → month
    if (type.includes('membership') || type.includes('recurring_donation')) {
        return MONTH_DAYS;
    }

    // One-time coffee / extra without clear amount → week
    return WEEK_DAYS;
}

export function verifyBmcSignature(rawBody, signatureHeader, secret) {
    if (!secret || !signatureHeader) return false;
    const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(digest);
    const b = Buffer.from(String(signatureHeader));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

function isGrantEvent(type) {
    return (
        type.includes('membership.started') ||
        type.includes('membership.updated') ||
        type.includes('recurring_donation.started') ||
        type.includes('recurring_donation.updated') ||
        type.includes('extra_purchase.created') ||
        type.includes('extra_purchase.updated') ||
        type.includes('donation.created')
    );
}

function isRefundEvent(type) {
    return (
        type.includes('donation.refunded') ||
        type.includes('extra_purchase.refunded') ||
        type.includes('membership.refunded')
    );
}

export async function handleBmcWebhook(eventType, payload) {
    const email = extractEmail(payload);
    const membershipId = extractMembershipId(payload);
    const type = String(eventType || payload?.type || payload?.event_name || '').toLowerCase();
    const amount = extractAmount(payload);

    if (!email) {
        return { ok: false, reason: 'No email in webhook payload' };
    }

    if (isGrantEvent(type)) {
        const days = resolveAccessDays(payload, type);
        const user = await grantBmcAccessByEmail(email, { membershipId, days });
        return {
            ok: true,
            action: days === MONTH_DAYS ? 'grant_30_days' : 'grant_7_days',
            days,
            amount,
            user: user?.email || null,
            pending: !user,
            skippedAdmin: user?.access_source === 'admin',
            accessUntil: user?.access_until || null,
            note: user
                ? null
                : 'No account yet — payment queued and will apply when this email registers or signs in.',
        };
    }

    // Refunds remove BMC access. Cancel/pause do NOT — paid time until access_until still applies.
    if (isRefundEvent(type)) {
        const user = await revokeBmcAccessByEmail(email);
        return { ok: true, action: 'revoke_refund', user: user?.email || null };
    }

    if (
        type.includes('membership.cancelled') ||
        type.includes('membership.paused') ||
        type.includes('recurring_donation.cancelled')
    ) {
        return {
            ok: true,
            action: 'ignored_cancel_keep_paid_period',
            user: email,
            note: 'Access remains until access_until from last payment; admin access untouched.',
        };
    }

    return { ok: true, action: 'ignored', type, amount };
}
