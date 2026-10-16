/**
 * Runs Cursor AI in a child process so a native segfault (exit 139)
 * cannot take down the Express server.
 *
 * Usage: node lib/generate-worker.js <promptPath> <resultPath>
 */
import fs from 'fs';
import { Agent } from '@cursor/sdk';
import { extractJson } from './extract-json.js';

function useCloudRuntime() {
  const forced = String(process.env.CURSOR_AGENT_RUNTIME || '').toLowerCase();
  if (forced === 'cloud') return true;
  if (forced === 'local') return false;
  return Boolean(process.env.RENDER);
}

const JSON_ONLY_TAIL = `

CRITICAL OUTPUT RULES:
- Your entire reply must be a single JSON object.
- Start with { and end with }.
- No markdown fences, no preamble, no commentary, no tool use.
- Do not write sentences like "The full lesson…" — emit the JSON fields instead.`;

function agentOptions(apiKey, cloud) {
  return cloud
    ? {
        apiKey,
        model: { id: 'composer-2.5' },
        cloud: { repos: [] },
      }
    : {
        apiKey,
        model: { id: 'composer-2.5' },
        local: { cwd: process.cwd() },
      };
}

async function runPrompt(prompt, options) {
  const result = await Agent.prompt(prompt, options);
  if (result.status !== 'finished' || !result.result) {
    throw new Error(result.error?.message || 'Cursor AI generation failed');
  }
  return String(result.result);
}

async function main() {
  const promptPath = process.argv[2];
  const resultPath = process.argv[3];
  if (!promptPath || !resultPath) {
    throw new Error('Usage: node lib/generate-worker.js <promptPath> <resultPath>');
  }

  const apiKey = (process.env.CURSOR_API_KEY || '').trim();
  if (!apiKey) throw new Error('CURSOR_API_KEY is missing');

  const prompt = fs.readFileSync(promptPath, 'utf8');
  const cloud = useCloudRuntime();
  console.error(`[generate-worker] runtime=${cloud ? 'cloud' : 'local'}`);

  const options = agentOptions(apiKey, cloud);
  let text = await runPrompt(`${prompt}${JSON_ONLY_TAIL}`, options);

  let data;
  try {
    data = extractJson(text);
  } catch (firstError) {
    console.error(`[generate-worker] parse failed, repairing: ${firstError.message}`);
    console.error(`[generate-worker] bad output preview: ${String(text).replace(/\s+/g, ' ').slice(0, 240)}`);
    const snippet = String(text).slice(0, 14000);
    text = await runPrompt(
      `You previously replied with invalid or non-JSON text while building a classroom worksheet.
Return ONLY the corrected JSON object now. No markdown, no explanation.

Broken reply to convert into valid JSON:
"""
${snippet}
"""

If the broken reply has no usable lesson content, invent nothing new beyond what that reply already contains — still return a minimal valid lesson JSON object with title, skill, cefr, sourceParagraphs, sourceText, and empty arrays for unused tasks.
${JSON_ONLY_TAIL}`,
      options
    );
    try {
      data = extractJson(text);
    } catch (secondError) {
      console.error(`[generate-worker] repair also failed: ${secondError.message}`);
      throw secondError;
    }
  }

  fs.writeFileSync(resultPath, `${JSON.stringify({ ok: true, data })}\n`, 'utf8');
}

main().catch((error) => {
  const message = error?.message || String(error) || 'Worker failed';
  const resultPath = process.argv[3];
  try {
    if (resultPath) {
      fs.writeFileSync(resultPath, `${JSON.stringify({ ok: false, error: message })}\n`, 'utf8');
    }
  } catch {
    /* ignore */
  }
  console.error(`[generate-worker] ${message}`);
  process.exit(1);
});
