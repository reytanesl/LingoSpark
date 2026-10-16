import { randomUUID } from 'crypto';

const jobs = new Map();
const MAX_AGE_MS = 45 * 60 * 1000;
const MAX_JOBS = 40;

function pruneJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.updatedAt > MAX_AGE_MS) jobs.delete(id);
  }
  if (jobs.size <= MAX_JOBS) return;
  const oldest = [...jobs.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
  while (jobs.size > MAX_JOBS && oldest.length) {
    const [id] = oldest.shift();
    jobs.delete(id);
  }
}

/** Lightweight status for polling — never includes the lesson payload. */
export function getJobStatus(id) {
  pruneJobs();
  const job = jobs.get(String(id || ''));
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    stage: job.stage || '',
    error: job.error || '',
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

/** Full result once; only when status is done. */
export function getJobResult(id) {
  pruneJobs();
  const job = jobs.get(String(id || ''));
  if (!job) return null;
  if (job.status === 'error') {
    return { id: job.id, status: 'error', error: job.error || 'Job failed' };
  }
  if (job.status !== 'done') {
    return {
      id: job.id,
      status: job.status,
      stage: job.stage || '',
      error: 'Job is not finished yet.',
    };
  }
  return {
    id: job.id,
    status: 'done',
    result: job.result,
  };
}

/**
 * Start background work. `runner(update)` may call update({ stage }) for progress.
 * Resolves when the job finishes; callers should return the job id immediately.
 */
export function startJob(runner) {
  pruneJobs();
  const id = randomUUID();
  const job = {
    id,
    status: 'queued',
    stage: 'queued',
    error: '',
    result: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(id, job);

  const update = (patch = {}) => {
    if (patch.stage) job.stage = patch.stage;
    job.updatedAt = Date.now();
  };

  job.status = 'running';
  job.stage = 'running';
  job.updatedAt = Date.now();

  Promise.resolve()
    .then(() => runner(update))
    .then((result) => {
      job.status = 'done';
      job.stage = 'done';
      job.result = result;
      job.updatedAt = Date.now();
    })
    .catch((error) => {
      job.status = 'error';
      job.stage = 'error';
      job.error = error?.message || String(error) || 'Job failed';
      job.updatedAt = Date.now();
      console.error(`Job ${id} failed:`, error);
    });

  return getJobStatus(id);
}

/** @deprecated use getJobStatus */
export function getJob(id) {
  return getJobStatus(id);
}
