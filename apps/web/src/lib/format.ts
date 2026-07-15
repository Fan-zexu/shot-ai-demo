export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export function formatDuration(seconds?: number) {
  if (seconds === undefined) return '待分析';
  return `${seconds.toFixed(1)}s`;
}

export function formatFps(fps?: number) {
  if (fps === undefined) return '待分析';
  return `${fps.toFixed(1)} fps`;
}
