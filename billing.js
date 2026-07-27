import crypto from 'crypto';
import { grantBmcAccessByEmail, revokeBmcAccessByEmail } from './db.js';

function extractEmail(payload) {
    const data = payload?.data || payload || {};
    return (
        data.supporter_email ||
        data.payer_email ||
        data.email ||
        data.member_email ||
        data.buyer_email ||
        data?.supporter?.email ||
        data?.member?.email ||
        ''
    );
}

function extractMembershipId(payload) {
    const data = payload?.data || payload || {};
    return String(data.membership_id || data.id || data.subscription_id || '') || null;
}

export function verifyBmcSignature(rawBody, signatureHeader, secret) {
    if (!secret || !signatureHeader) return false;
    const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(digest);
    const b = Buffer.from(String(signatureHeader));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

export async function handleBmcWebhook(eventType, payload) {
    const email = extractEmail(payload);
    const membershipId = extractMembershipId(payload);
    const type = String(eventType || payload?.type || payload?.event_name || '').toLowerCase();

    if (!email) {
        return { ok: false, reason: 'No email in webhook payload' };
    }

    if (
        type.includes('membership.started') ||
        type.includes('membership.updated') ||
        type.includes('recurring_donation.started') ||
        type.includes('recurring_donation.updated')
    ) {
        const user = await grantBmcAccessByEmail(email, { membershipId, days: null });
        return { ok: true, action: 'grant_membership', user: user?.email || null };
    }

    if (
        type.includes('extra_purchase') ||
        type.includes('donation.created')
    ) {
        const user = await grantBmcAccessByEmail(email, { membershipId, days: 30 });
        return { ok: true, action: 'grant_30_days', user: user?.email || null };
    }

    if (
        type.includes('membership.cancelled') ||
        type.includes('membership.paused') ||
        type.includes('recurring_donation.cancelled') ||
        type.includes('donation.refunded') ||
        type.includes('extra_purchase.refunded')
    ) {
        const user = await revokeBmcAccessByEmail(email);
        return { ok: true, action: 'revoke', user: user?.email || null };
    }

    return { ok: true, action: 'ignored', type };
}
