'use client';

import { useEffect, useState } from 'react';
import { emptyState, type HouseState, validateState } from './model';

const STATE_KEY = 'house.local.state.v1';
const DB_NAME = 'house-local-v1';
const IMAGE_STORE = 'images';
const objectUrls = new Map<string, string>();

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(IMAGE_STORE))
        request.result.createObjectStore(IMAGE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGet(id: string): Promise<Blob | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(IMAGE_STORE).objectStore(IMAGE_STORE).get(id);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function dbPut(id: string, blob: Blob) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const request = db
      .transaction(IMAGE_STORE, 'readwrite')
      .objectStore(IMAGE_STORE)
      .put(blob, id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function putLocalImage(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const id = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
  await dbPut(id, blob);
  return id;
}

export async function getLocalImageBlob(id: string) {
  const local = await dbGet(id);
  if (local) return local;
  // One-time compatibility path for data created by the previous local server build.
  const response = await fetch(`/api/images/${id}`);
  if (!response.ok) throw new Error('本地图片不存在');
  const blob = await response.blob();
  await dbPut(id, blob);
  return blob;
}

export async function getLocalImageUrl(id: string) {
  const cached = objectUrls.get(id);
  if (cached) return cached;
  const url = URL.createObjectURL(await getLocalImageBlob(id));
  objectUrls.set(id, url);
  return url;
}

export function useLocalImageUrl(id?: string) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    if (!id) {
      setUrl('');
      return;
    }
    void getLocalImageUrl(id)
      .then((value) => active && setUrl(value))
      .catch(() => active && setUrl(''));
    return () => {
      active = false;
    };
  }, [id]);
  return url;
}

export async function loadLocalState() {
  const stored = localStorage.getItem(STATE_KEY);
  if (stored) {
    const parsed: unknown = JSON.parse(stored);
    if (validateState(parsed)) return parsed;
  }
  try {
    const response = await fetch('/api/state');
    if (response.ok) {
      const payload = (await response.json()) as { state?: unknown };
      if (validateState(payload.state)) {
        saveLocalState(payload.state);
        return payload.state;
      }
    }
  } catch {}
  return emptyState();
}

export function saveLocalState(state: HouseState) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

export async function clearLocalData() {
  localStorage.removeItem(STATE_KEY);
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls.clear();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

export async function localImagesAsDataUrls(ids: string[]) {
  const result: Record<string, string> = {};
  for (const id of ids) {
    const blob = await getLocalImageBlob(id);
    result[id] = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  return result;
}

export async function restoreLocalImage(id: string, dataUrl: string) {
  const blob = await (await fetch(dataUrl)).blob();
  const actualId = await putLocalImage(blob);
  if (actualId !== id) throw new Error('备份图片校验失败');
}
