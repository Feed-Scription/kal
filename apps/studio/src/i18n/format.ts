import i18n from './index';

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(i18n.language, { hour12: false });
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatTimeFromTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(i18n.language, { hour12: false });
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(i18n.language);
}

export function formatTimeShort(): string {
  return new Date().toLocaleTimeString(i18n.language);
}
