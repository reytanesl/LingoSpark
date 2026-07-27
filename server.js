import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Agent } from '@cursor/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

function extractJson(text) {
    if (!text) throw new Error('Empty response from Cursor AI');
    const trimmed = text.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : trimmed;
    return JSON.parse(candidate);
}

app.post('/api/generate', async (req, res) => {
    const prompt = req.body?.prompt;
    if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Missing prompt' });
    }

    const apiKey = process.env.CURSOR_API_KEY;
    if (!apiKey) {
        return res.status(503).json({ error: 'Server not configured: CURSOR_API_KEY is missing.' });
    }

    const fullPrompt = `${prompt}\n\nReturn ONLY valid JSON. No markdown fences, no explanation, no tool use.`;

    try {
        const result = await Agent.prompt(fullPrompt, {
            apiKey,
            model: { id: 'composer-2.5' },
            local: { cwd: __dirname },
        });

        if (result.status !== 'finished' || !result.result) {
            const message = result.error?.message || 'Cursor AI generation failed';
            return res.status(500).json({ error: message });
        }

        const parsed = extractJson(result.result);
        res.json(parsed);
    } catch (error) {
        console.error('Generation error:', error);
        res.status(500).json({ error: error.message || 'Failed to generate content' });
    }
});

app.get('/api/health', (_req, res) => {
    res.json({
        ok: true,
        cursorConfigured: Boolean(process.env.CURSOR_API_KEY),
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`LingoSpark running on port ${PORT}`);
    if (!process.env.CURSOR_API_KEY) {
        console.warn('Warning: CURSOR_API_KEY is not set. Writing Suite will be unavailable.');
    }
});
