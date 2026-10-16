/**
 * Browser Google Drive upload via Identity Services + Drive REST API.
 * Requires a Web OAuth client ID with authorized JavaScript origins.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_KEY = 'lessonCreatorDriveFolderId';
const FOLDER_NAME = 'Lesson Creator';

let gisReady = null;
let tokenClient = null;
let accessToken = '';
let clientId = '';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-gdrive="${src}"]`);
    if (existing) {
      if (existing.dataset.ready === '1') resolve();
      else existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Could not load Google sign-in.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.gdrive = src;
    script.onload = () => {
      script.dataset.ready = '1';
      resolve();
    };
    script.onerror = () => reject(new Error('Could not load Google sign-in.'));
    document.head.appendChild(script);
  });
}

export async function loadGoogleDriveConfig() {
  if (clientId) return clientId;
  const res = await fetch('/api/config');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not load app config.');
  clientId = String(data.googleClientId || '').trim();
  return clientId;
}

export function googleDriveConfigured() {
  return Boolean(clientId);
}

async function ensureGis() {
  if (!gisReady) {
    gisReady = loadScript(GIS_SRC).then(() => {
      if (!window.google?.accounts?.oauth2) {
        throw new Error('Google Identity Services failed to initialize.');
      }
    });
  }
  await gisReady;
}

function requestToken(prompt = '') {
  return new Promise(async (resolve, reject) => {
    try {
      const id = await loadGoogleDriveConfig();
      if (!id) {
        reject(new Error('Google Drive is not configured. Add GOOGLE_CLIENT_ID to .env.'));
        return;
      }
      await ensureGis();
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: id,
        scope: SCOPE,
        callback: (response) => {
          if (response.error) {
            reject(new Error(response.error_description || response.error));
            return;
          }
          accessToken = response.access_token || '';
          if (!accessToken) {
            reject(new Error('Google did not return an access token.'));
            return;
          }
          resolve(accessToken);
        },
        error_callback: (err) => {
          reject(new Error(err?.message || 'Google sign-in was cancelled.'));
        },
      });
      tokenClient.requestAccessToken({ prompt });
    } catch (error) {
      reject(error);
    }
  });
}

export async function getDriveAccessToken() {
  if (accessToken) {
    try {
      const probe = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (probe.ok) return accessToken;
    } catch {
      /* request a fresh token */
    }
    accessToken = '';
  }
  try {
    return await requestToken('');
  } catch {
    return requestToken('consent');
  }
}

async function ensureLessonFolder(token) {
  const cached = localStorage.getItem(FOLDER_KEY);
  if (cached) {
    try {
      const check = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cached)}?fields=id,trashed`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (check.ok) {
        const meta = await check.json();
        if (meta?.id && !meta.trashed) return meta.id;
      }
    } catch {
      /* create a new folder */
    }
    localStorage.removeItem(FOLDER_KEY);
  }

  const create = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!create.ok) {
    const err = await create.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Could not create a Lesson Creator folder on Drive.');
  }
  const folder = await create.json();
  if (folder?.id) localStorage.setItem(FOLDER_KEY, folder.id);
  return folder.id;
}

/**
 * Upload a Blob to Google Drive (Lesson Creator folder).
 * @returns {{ id, name, webViewLink }}
 */
export async function uploadBlobToDrive(blob, { name, mimeType = 'application/pdf' } = {}) {
  if (!blob) throw new Error('Nothing to upload.');
  const token = await getDriveAccessToken();
  const folderId = await ensureLessonFolder(token);
  const boundary = `lc_${Date.now().toString(16)}`;
  const metadata = {
    name: name || 'lesson.pdf',
    parents: folderId ? [folderId] : undefined,
  };
  const metaPart = JSON.stringify(metadata);
  const preamble = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;
  const body = new Blob([preamble, blob, closing], { type: `multipart/related; boundary=${boundary}` });

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Google Drive upload failed.');
  }
  return data;
}
