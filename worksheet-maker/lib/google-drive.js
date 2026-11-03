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

/** Error with a stable `code` so the UI can show a localized message. */
export class DriveError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'DriveError';
    this.code = code;
  }
}

/** Map a Google Identity Services error (callback or error_callback) to a DriveError code. */
export function classifyGisError(err) {
  const type = String(err?.type || err?.error || err?.message || '').toLowerCase();
  if (type.includes('popup_failed_to_open') || type.includes('popup_blocked')) return 'popup_blocked';
  if (type.includes('popup_closed') || type.includes('access_denied') || type.includes('cancel')) return 'cancelled';
  if (type.includes('origin') || type.includes('redirect_uri') || type.includes('invalid_client') || type.includes('unauthorized_client')) return 'origin';
  return 'auth_failed';
}

/** Map a Drive REST response status to a DriveError code. */
export function classifyDriveStatus(status) {
  if (status === 401) return 'not_connected';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  return 'upload_failed';
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-gdrive="${src}"]`);
    if (existing) {
      if (existing.dataset.ready === '1') resolve();
      else existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new DriveError('script_blocked', 'Could not load Google sign-in.')), { once: true });
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
    script.onerror = () => {
      script.remove();
      reject(new DriveError('script_blocked', 'Could not load Google sign-in.'));
    };
    document.head.appendChild(script);
  });
}

export async function loadGoogleDriveConfig() {
  if (clientId) return clientId;
  // Relative on purpose: on lingospark.study the app is mounted at /worksheet-maker,
  // so '/api/config' (absolute) 404s and Drive looked unconfigured.
  const res = await fetch('api/config');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new DriveError('config', data.error || 'Could not load app config.');
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
        throw new DriveError('script_blocked', 'Google Identity Services failed to initialize.');
      }
    }).catch((error) => {
      gisReady = null;
      throw error;
    });
  }
  await gisReady;
}

function requestToken(prompt = '') {
  return new Promise(async (resolve, reject) => {
    try {
      const id = await loadGoogleDriveConfig();
      if (!id) {
        reject(new DriveError('config', 'Google Drive is not configured. Add GOOGLE_CLIENT_ID to .env.'));
        return;
      }
      await ensureGis();
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: id,
        scope: SCOPE,
        callback: (response) => {
          if (response.error) {
            reject(new DriveError(classifyGisError(response), response.error_description || response.error));
            return;
          }
          accessToken = response.access_token || '';
          if (!accessToken) {
            reject(new DriveError('auth_failed', 'Google did not return an access token.'));
            return;
          }
          resolve(accessToken);
        },
        error_callback: (err) => {
          reject(new DriveError(classifyGisError(err), err?.message || 'Google sign-in was cancelled.'));
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
  // One popup only: a second (consent) attempt after an async failure has no user
  // activation left and is always blocked by the browser.
  return requestToken('');
}

/** Load config + GIS early (page load) so the click can open the popup synchronously-ish. */
export async function preloadGoogleDrive() {
  const id = await loadGoogleDriveConfig();
  if (id) await ensureGis();
  return Boolean(id);
}

/** Get a token; call this straight from the click handler, before slow PDF work. */
export async function connectGoogleDrive() {
  return getDriveAccessToken();
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
    if (create.status === 401) accessToken = '';
    throw new DriveError(classifyDriveStatus(create.status), err?.error?.message || 'Could not create a Lesson Creator folder on Drive.');
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
  if (!blob) throw new DriveError('upload_failed', 'Nothing to upload.');
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

  let res;
  try {
    res = await fetch(
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
  } catch (error) {
    throw new DriveError('network', error?.message || 'Network error while uploading to Google Drive.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) accessToken = '';
    throw new DriveError(classifyDriveStatus(res.status), data?.error?.message || 'Google Drive upload failed.');
  }
  return data;
}
