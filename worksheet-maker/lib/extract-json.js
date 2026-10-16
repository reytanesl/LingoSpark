/** Escape raw control characters inside JSON strings so JSON.parse can read model output. */
export function sanitizeJsonText(text) {
  const src = String(text || '');
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    const code = src.charCodeAt(i);
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      out += ch;
      inString = false;
      continue;
    }
    if (code < 32) {
      if (ch === '\n') out += '\\n';
      else if (ch === '\r') out += '\\r';
      else if (ch === '\t') out += '\\t';
      else out += `\\u${code.toString(16).padStart(4, '0')}`;
      continue;
    }
    out += ch;
  }
  return out;
}

/** Find the first top-level `{ ... }` object, respecting strings. */
export function extractBalancedObject(text) {
  const src = String(text || '');
  const start = src.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

function parseCandidate(candidate) {
  try {
    return JSON.parse(candidate);
  } catch (first) {
    try {
      return JSON.parse(sanitizeJsonText(candidate));
    } catch {
      throw first;
    }
  }
}

export function extractJson(text) {
  if (!text) throw new Error('Empty response from Cursor AI');
  const trimmed = String(text).trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let blob = fenced ? fenced[1].trim() : trimmed;

  const balanced = extractBalancedObject(blob)
    || extractBalancedObject(trimmed);
  if (balanced) {
    try {
      return parseCandidate(balanced);
    } catch {
      /* fall through to clearer error below */
    }
  }

  // Legacy slice between first/last brace (weaker, but recovers some broken outputs).
  const firstBrace = blob.indexOf('{');
  const lastBrace = blob.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return parseCandidate(blob.slice(firstBrace, lastBrace + 1));
    } catch {
      /* fall through */
    }
  }

  const preview = trimmed.replace(/\s+/g, ' ').slice(0, 120);
  if (!trimmed.includes('{')) {
    const err = new Error(
      `AI returned text instead of JSON (starts with: "${preview}"). Try Create worksheet again.`
    );
    err.retryable = true;
    throw err;
  }
  const err = new Error(
    `AI returned invalid JSON (starts with: "${preview}"). Try Create worksheet again.`
  );
  err.retryable = true;
  throw err;
}
