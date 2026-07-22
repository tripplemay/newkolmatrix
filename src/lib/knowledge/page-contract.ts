// M1-D-KNOWLEDGE F004 — knowledge 页面契约（可序列化 prop，沿 ProjectDetailData 范式）。
//
// RSC（page-data.ts）组装 → KnowledgeWorkbench 消费；客户端轮询（GET /api/materials）
// 拿到 MaterialDto 后用同一映射器刷新行——服务端/客户端共用本文件的纯映射，
// 展示口径单点（tone/label 单点先例，M1-C F005 同向）。
//
// 取代已退役的知识页 mock 契约（M1-D F004）：sell/aud/rules 来自
// GameKnowledge 链头（structured 读侧宽松降级，脏数据 → 空数组走「待解析」占位，D2）。

import type { MaterialDto } from 'lib/knowledge/dto';
import type { AudienceSlice } from 'lib/data/schemas/knowledge';
import { formatRelativeTime } from 'lib/display/relative-time';

// ── 游戏主题色（DB 无色列，展示层按序确定性分配；前 4 色沿原型 GAMEKB 调色板）──
export const GAME_COLOR_PALETTE = [
  '#422afb',
  '#01b574',
  '#3965ff',
  '#e89a1c',
] as const;

export function gameColorForIndex(index: number): string {
  return GAME_COLOR_PALETTE[index % GAME_COLOR_PALETTE.length];
}

/** 🔒 kb-use 跨 Agent 消费链宣示（原型语义；F005 ⑤层注入后为真实机制而非宣示）。 */
export const KB_USE_NOTE =
  '匹配 Agent 用受众做匹配 · 触达 Agent 用卖点起草 · 合规 Agent 用红线拦截';

// ── 素材行视图 ──

/** 原型 mIc 四类图标槽位（🔒 不得合并）；DB MaterialType 六值 → 四槽映射。 */
export type MaterialIconKind = 'doc' | 'video' | 'data' | 'image';

const ICON_BY_DB_TYPE: Record<string, MaterialIconKind> = {
  lore: 'doc',
  gameplay_doc: 'doc',
  review: 'doc',
  art: 'image',
  data: 'data',
  video: 'video',
};

export function materialIconKind(dbType: string): MaterialIconKind {
  return ICON_BY_DB_TYPE[dbType] ?? 'doc';
}

/** 状态三态视图：parsed 绿「AI 已解析」/ pending·parsing 琥珀「解析中…」/ failed 红 + parseError 明示（D2）。 */
export type MaterialStatusView = 'done' | 'analyzing' | 'failed';

export function materialStatusView(parseStatus: string): MaterialStatusView {
  if (parseStatus === 'parsed') return 'done';
  if (parseStatus === 'failed') return 'failed';
  return 'analyzing'; // pending / parsing：等待或进行中，对用户同为「解析中…」
}

export interface KnowledgeMaterialView {
  id: string;
  name: string;
  icon: MaterialIconKind;
  /** 来源（官方 / 你上传 / …）；DB 空 → '—' */
  src: string;
  /** 相对时间展示串 */
  date: string;
  status: MaterialStatusView;
  /** failed 红态明示文案（D2 诚实降级） */
  parseError: string | null;
}

export function toMaterialView(
  dto: MaterialDto,
  now: Date,
): KnowledgeMaterialView {
  return {
    id: dto.id,
    name: dto.fileName,
    icon: materialIconKind(dto.type),
    src: dto.source ?? '—',
    date: formatRelativeTime(new Date(dto.createdAt), now),
    status: materialStatusView(dto.parseStatus),
    parseError: dto.parseError,
  };
}

// ── 页面契约 ──

export interface KnowledgeAnalysisData {
  /** 卖点（selling_point 链头；空 = 待解析占位） */
  sell: string[];
  /** 受众切片（audience 链头） */
  aud: AudienceSlice[];
  /** 合规红线（compliance_redline 链头） */
  rules: string[];
  /** 溯源素材计数（kb-prov 行文案用；0 = 尚无解析产物） */
  sourceCount: number;
}

export interface KnowledgeGameData {
  /** Game.id（?game= URL 槽位；D2：非法值客户端回退首个游戏） */
  id: string;
  name: string;
  /** 展示主题色（gameColorForIndex 确定性分配） */
  color: string;
  /** 素材行（服务端初始；客户端轮询后经 toMaterialView 刷新） */
  materials: KnowledgeMaterialView[];
  analysis: KnowledgeAnalysisData;
  /** ProvenanceTag 契约位（行级 user_upload + analysis 字段 ai_estimate，沿 §7.5） */
  dataSource: string;
  fieldProvenance: Record<string, unknown>;
}

/** kb-prov 溯源行文案（原型 from 语义；无产物 → 待解析口径）。 */
export function provenanceLabel(analysis: KnowledgeAnalysisData): string {
  return analysis.sourceCount > 0
    ? `策略 Agent 基于 ${analysis.sourceCount} 份素材分析`
    : '待解析——上传素材后由策略 Agent 生成';
}

/** ?game= 值域校验：非法 / 缺失 → 首个游戏（D2 语义：绝不抛错）。 */
export function findKnowledgeGame(
  games: KnowledgeGameData[],
  id: string | undefined,
): KnowledgeGameData | null {
  if (games.length === 0) return null;
  return games.find((g) => g.id === id) ?? games[0];
}
