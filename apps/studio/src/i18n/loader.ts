import i18n from 'i18next';

const STORAGE_KEY = 'kal.studio.externalLocales';
const DATA_PREFIX = 'kal.studio.localeData.';

export interface ExternalLocaleMeta {
  lang: string;
  label: string;
  sourceUrl?: string;
  loadedAt: string;
}

interface LocalePack {
  lang: string;
  label: string;
  namespaces: Record<string, Record<string, unknown>>;
}

function validatePack(data: unknown): data is LocalePack {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.lang === 'string' &&
    typeof obj.label === 'string' &&
    obj.namespaces !== null &&
    typeof obj.namespaces === 'object'
  );
}

function injectPack(pack: LocalePack) {
  for (const [ns, bundle] of Object.entries(pack.namespaces)) {
    i18n.addResourceBundle(pack.lang, ns, bundle, true, true);
  }
}

function getMetaList(): ExternalLocaleMeta[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function setMetaList(list: ExternalLocaleMeta[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

async function loadAndRegister(pack: LocalePack, sourceUrl?: string) {
  injectPack(pack);
  localStorage.setItem(DATA_PREFIX + pack.lang, JSON.stringify(pack.namespaces));
  const list = getMetaList().filter((m) => m.lang !== pack.lang);
  list.push({ lang: pack.lang, label: pack.label, sourceUrl, loadedAt: new Date().toISOString() });
  setMetaList(list);
}

export async function loadLocaleFromUrl(url: string): Promise<LocalePack> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: unknown = await res.json();
  if (!validatePack(data)) throw new Error('Invalid language pack format');
  await loadAndRegister(data, url);
  return data;
}

export async function loadLocaleFromFile(file: File): Promise<LocalePack> {
  const text = await file.text();
  const data: unknown = JSON.parse(text);
  if (!validatePack(data)) throw new Error('Invalid language pack format');
  await loadAndRegister(data);
  return data;
}

export function restoreCachedLocales() {
  for (const meta of getMetaList()) {
    try {
      const raw = localStorage.getItem(DATA_PREFIX + meta.lang);
      if (!raw) continue;
      const namespaces = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      injectPack({ lang: meta.lang, label: meta.label, namespaces });
    } catch {
      // skip corrupted cache entries
    }
  }
}

export function removeExternalLocale(lang: string) {
  setMetaList(getMetaList().filter((m) => m.lang !== lang));
  localStorage.removeItem(DATA_PREFIX + lang);
  // If currently using the removed language, fall back to English
  if (i18n.language === lang) {
    i18n.changeLanguage('en');
  }
}

export function getExternalLocales(): ExternalLocaleMeta[] {
  return getMetaList();
}
