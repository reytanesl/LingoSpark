/**
 * Pluggable transactional mailer.
 *
 * Provider is picked from environment variables (first match wins):
 *   1. Resend  — RESEND_API_KEY (+ MAIL_FROM, a sender on a domain verified in Resend)
 *   2. SMTP    — SMTP_HOST (+ SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, MAIL_FROM) via nodemailer
 *   3. log     — nothing configured: development prints the message (incl. links) to the server log;
 *                production only logs a warning that the email was NOT sent (never the link).
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function maskEmail(email) {
    const [user = '', domain = ''] = String(email || '').split('@');
    if (!domain) return '***';
    return `${user.slice(0, 2)}***@${domain}`;
}

export function mailProviderFromEnv(env = process.env) {
    if (env.RESEND_API_KEY) return 'resend';
    if (env.SMTP_HOST) return 'smtp';
    return 'log';
}

export function createMailer(env = process.env, { logger = console, fetchImpl = globalThis.fetch, nodemailerImport = () => import('nodemailer') } = {}) {
    const provider = mailProviderFromEnv(env);
    const production = env.NODE_ENV === 'production';
    let from = String(env.MAIL_FROM || '').trim();
    if (!from && provider === 'resend') {
        // Resend's shared test sender only delivers to the Resend account owner — fine for a first test, not for users.
        from = 'LingoSpark <onboarding@resend.dev>';
        logger.warn('[mail] MAIL_FROM not set — using Resend test sender onboarding@resend.dev (only delivers to your own Resend account email).');
    }
    if (!from && provider === 'smtp') from = String(env.SMTP_USER || '').trim();
    if (!from) from = 'LingoSpark <no-reply@localhost>';

    let smtpTransport = null;
    async function getSmtpTransport() {
        if (smtpTransport) return smtpTransport;
        const mod = await nodemailerImport();
        const nodemailer = mod.default || mod;
        const port = Number(env.SMTP_PORT) || 587;
        const secure = env.SMTP_SECURE ? /^(1|true|yes)$/i.test(String(env.SMTP_SECURE)) : port === 465;
        smtpTransport = nodemailer.createTransport({
            host: env.SMTP_HOST,
            port,
            secure,
            auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS || '' } : undefined,
        });
        return smtpTransport;
    }

    async function send({ to, subject, text, html }) {
        if (!to || !subject) throw new Error('Mail needs a recipient and a subject.');
        if (provider === 'resend') {
            const res = await fetchImpl(RESEND_ENDPOINT, {
                method: 'POST',
                headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ from, to: [to], subject, text, html }),
            });
            if (!res.ok) {
                const body = await res.text().catch(() => '');
                throw new Error(`Resend responded ${res.status}: ${body.slice(0, 200)}`);
            }
            const data = await res.json().catch(() => ({}));
            return { provider, id: data.id || null };
        }
        if (provider === 'smtp') {
            const transport = await getSmtpTransport();
            const info = await transport.sendMail({ from, to, subject, text, html });
            return { provider, id: info?.messageId || null };
        }
        if (production) {
            logger.warn(`[mail] No email provider configured (set RESEND_API_KEY or SMTP_HOST). Email "${subject}" to ${maskEmail(to)} was NOT sent.`);
        } else {
            logger.log(`\n[mail:dev] To: ${to}\n[mail:dev] Subject: ${subject}\n${text}\n`);
        }
        return { provider, id: null, delivered: false };
    }

    return {
        provider,
        from,
        configured: provider !== 'log',
        send,
    };
}
