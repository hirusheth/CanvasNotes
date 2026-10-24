import type { El } from './types';

export type Op = { op: 'put'; el: El } | { op: 'del'; id: string };

async function json<T>(res: Response): Promise<T> {
  // The session expired or was signed out elsewhere: reload to show the sign-in page.
  if (res.status === 401) {
    location.reload();
    throw new Error('Sign in required');
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export async function fetchState(): Promise<{ elements: El[]; auth: boolean }> {
  const data = await json<{ elements: El[]; auth?: boolean }>(await fetch('/api/state'));
  return { elements: data.elements, auth: !!data.auth };
}

export async function logout(): Promise<void> {
  await fetch('/api/logout', { method: 'POST' });
  location.reload();
}

export async function applyOps(ops: Op[]): Promise<void> {
  await json(await fetch('/api/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops }) }));
}

export interface Uploaded {
  url: string;
  name: string;
  size: number;
  mime: string;
}

export async function upload(file: File): Promise<Uploaded> {
  const res = await fetch(`/api/upload?name=${encodeURIComponent(file.name || 'pasted')}`, {
    method: 'POST',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  });
  return json<Uploaded>(res);
}

export interface Unfurled {
  ok: boolean;
  url?: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  site?: string | null;
}

export async function unfurl(url: string): Promise<Unfurled> {
  return json<Unfurled>(await fetch(`/api/unfurl?url=${encodeURIComponent(url)}`));
}

export async function importElements(elements: El[], mode: 'merge' | 'replace'): Promise<void> {
  await json(await fetch('/api/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ elements, mode }) }));
}
