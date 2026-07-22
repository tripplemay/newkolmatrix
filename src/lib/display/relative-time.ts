// M1-C F003 — 相对时间展示串（feed 时间列）。
//
// 展示层纯函数：now 由调用方注入（RSC 边界），不自读时钟——与 domain 纯度约束同一取向。
// 未来时间（时钟漂移等脏数据）宽松归「刚刚」，绝不抛错（D2）。

export function formatRelativeTime(date: Date, now: Date): string {
  const diffMs = now.getTime() - date.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 60_000) return '刚刚';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  return `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, '0')}`;
}
