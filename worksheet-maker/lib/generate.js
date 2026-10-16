import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.join(__dirname, 'generate-worker.js');

function isRetryableParseError(error) {
  const msg = String(error?.message || error || '');
  return /unexpected end of json|unterminated string|unexpected token|not valid json|instead of json|invalid json|empty response from cursor|exited with code 139|segfault/i.test(msg)
    || Boolean(error?.retryable);
}

function useCloudRuntime() {
  const forced = String(process.env.CURSOR_AGENT_RUNTIME || '').toLowerCase();
  if (forced === 'cloud') return true;
  if (forced === 'local') return false;
  return Boolean(process.env.RENDER);
}

function runWorkerOnce(prompt, { apiKey, cwd }) {
  return new Promise(async (resolve, reject) => {
    const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const promptPath = path.join(os.tmpdir(), `lc-prompt-${stamp}.txt`);
    const resultPath = path.join(os.tmpdir(), `lc-result-${stamp}.json`);
    const cloud = useCloudRuntime();

    try {
      await fs.writeFile(promptPath, prompt, 'utf8');
    } catch (error) {
      reject(error);
      return;
    }

    const child = spawn(process.execPath, [WORKER, promptPath, resultPath], {
      cwd: cwd || process.cwd(),
      env: {
        ...process.env,
        CURSOR_API_KEY: apiKey,
        // Always prefer cloud on Render; never fall back to local there.
        CURSOR_AGENT_RUNTIME: cloud ? 'cloud' : (process.env.CURSOR_AGENT_RUNTIME || 'local'),
        RENDER: process.env.RENDER || (cloud ? 'true' : ''),
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });

    child.on('error', async (error) => {
      await cleanup(promptPath, resultPath);
      reject(error);
    });

    child.on('close', async (code, signal) => {
      try {
        if (code === 139 || signal === 'SIGSEGV') {
          throw new Error(
            'AI worker crashed (exit 139 / segfault). On Render the Cursor local SDK is unstable — use cloud runtime. Try again.'
          );
        }

        let raw = '';
        try {
          raw = await fs.readFile(resultPath, 'utf8');
        } catch {
          raw = '';
        }

        if (!raw.trim()) {
          throw new Error(
            stderr.trim()
              || `AI worker exited with code ${code}${signal ? ` (${signal})` : ''} and wrote no result.`
          );
        }

        const parsed = JSON.parse(raw);
        if (!parsed.ok) throw new Error(parsed.error || 'AI worker failed');
        resolve(parsed.data);
      } catch (error) {
        reject(error);
      } finally {
        await cleanup(promptPath, resultPath);
      }
    });
  });
}

async function cleanup(...files) {
  await Promise.all(
    files.map(async (file) => {
      try {
        await fs.unlink(file);
      } catch {
        /* ignore */
      }
    })
  );
}

/**
 * Generate JSON via a child process so native SDK crashes cannot kill the web server.
 */
export async function generateJson(prompt, { apiKey, cwd, retries = 3 } = {}) {
  const attempts = Math.max(1, Number(retries) || 1);
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await runWorkerOnce(prompt, { apiKey, cwd });
    } catch (error) {
      lastError = error;
      const retry = i < attempts - 1 && isRetryableParseError(error);
      if (!retry) throw error;
      console.warn(`generateJson: retry ${i + 1}/${attempts - 1} after: ${error.message}`);
    }
  }
  throw lastError;
}
