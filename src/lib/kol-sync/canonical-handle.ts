// M2-B-CREATORS F003 —— canonicalHandle 归一单点（【P3】）。
//
// 原实现在 scripts/seed/import-kol-csv.ts（M0 F004）；本批抽出共享：seed 与 kol-sync
// 两个消费方走同一构造，防止同一创作者因归一规则漂移而重复入库。
// 逻辑逐字保持（seed 行为零变更）：URL 清洗（去协议/www/尾斜杠 + 小写）优先，
// 无 URL 回退 `platform:name-slug`。
//
// 已知去重边界（诚实记录，非本批可解）：同一创作者的不同 URL 形态（如 YouTube
// `@handle` vs `channel/UCxxx`）会归一出不同 handle → 可能各存一行。身份消解
//（platformUserId 级）需要独立的 identity resolution，不在本批范围。

/** 从频道 URL 派生稳定唯一 canonicalHandle：youtube.com/@handle（小写，去协议/www/尾斜杠）。 */
export function deriveCanonicalHandle(
  url: string | undefined,
  platform: string,
  name: string,
): string {
  const u = (url ?? '').trim();
  if (u) {
    const cleaned = u
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/+$/, '')
      .toLowerCase();
    if (cleaned) return cleaned;
  }
  const slug = name.trim().toLowerCase().replace(/\s+/g, '-') || 'unknown';
  return `${platform.toLowerCase()}:${slug}`;
}
