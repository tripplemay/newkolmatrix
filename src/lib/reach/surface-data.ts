// M3-A-REACH-CRM F008 — V6 触达面数据组装（RSC 侧；沿 M2-A F005 loadMatchSurfaceData 先例）
//
// 左栏人列 = 已有 OutreachThread 的 KOL ∪ 现行 approved 组合成员（裁决 #5：批准组合即触达
// 候选集；无 thread 成员为 pending_send 虚拟行，与 crmInfer 空事实推断一致）。
// 五态 pill = crmInfer 真值（三处复用铁律 ①）：每人从已加载事实经 `inferCrmStatus` 现算，
// 不读 OutreachThread.status 物化列（物化列只服务查询过滤，展示恒走纯函数防漂移）。
// 失败静默降级空表（CI 无库安全，page.tsx match 先例同款）。

import { prisma } from 'lib/db/prisma';
import { getDevTenantId } from 'lib/agent/context';
import { inferCrmStatus } from 'lib/domain/crm-infer';
import { formatPlat } from 'lib/display/match-format';
import {
  EMPTY_REACH_SURFACE,
  REACH_STATUS_LABEL,
  type ReachMessageView,
  type ReachPersonView,
  type ReachSurfaceData,
} from 'lib/display/reach-format';

/** 气泡时间戳（原型 .mt 短格式）。 */
function formatAt(d: Date): string {
  return d.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export async function loadReachSurfaceData(
  projectId: string,
): Promise<ReachSurfaceData> {
  try {
    const tenantId = await getDevTenantId();

    const [threads, approvedPlan] = await Promise.all([
      prisma.outreachThread.findMany({
        where: { tenantId, projectId },
        include: {
          kol: {
            select: {
              id: true,
              displayName: true,
              handle: true,
              platform: true,
              followers: true,
              language: true,
              contactEmail: true,
            },
          },
          messages: { orderBy: { createdAt: 'asc' } },
          quotes: { select: { status: true } },
        },
      }),
      prisma.matchPlan.findFirst({
        where: { tenantId, projectId, status: 'approved' },
        select: {
          kols: {
            select: {
              kolId: true,
              matchScore: true,
              kol: {
                select: {
                  id: true,
                  displayName: true,
                  handle: true,
                  platform: true,
                  followers: true,
                  language: true,
                  contactEmail: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const threadIds = threads.map((t) => t.id);
    const signals = threadIds.length
      ? await prisma.signal.findMany({
          where: { tenantId, threadId: { in: threadIds } },
          select: {
            id: true,
            threadId: true,
            type: true,
            payloadJson: true,
            detectedAt: true,
          },
        })
      : [];

    // 受众匹配分：approved PlanKol 优先，缺席回落 MatchCandidate（裁决 #2：缺失 → null 待核）
    const planScore = new Map<string, number>(
      (approvedPlan?.kols ?? []).map((k) => [k.kolId, k.matchScore]),
    );
    const kolIdsAll = new Set<string>([
      ...threads.map((t) => t.kolId),
      ...(approvedPlan?.kols ?? []).map((k) => k.kolId),
    ]);
    const candidates = kolIdsAll.size
      ? await prisma.matchCandidate.findMany({
          where: { tenantId, projectId, kolId: { in: [...kolIdsAll] } },
          select: { kolId: true, matchScore: true, scorePending: true },
        })
      : [];
    const candScore = new Map(
      candidates.map((c) => [
        c.kolId,
        c.scorePending ? null : c.matchScore, // 降级纯向量分 → 「待核」（裁决 #2）
      ]),
    );
    const matchOf = (kolId: string): number | null => {
      const s = planScore.get(kolId) ?? candScore.get(kolId) ?? null;
      return s == null ? null : Math.round(s * 100);
    };

    type KolLite = {
      id: string;
      displayName: string | null;
      handle: string | null;
      platform: string | null;
      followers: number | null;
      language: string | null;
      contactEmail: string | null;
    };

    const buildPerson = (
      kol: KolLite,
      thread: (typeof threads)[number] | null,
    ): ReachPersonView => {
      const visible = (thread?.messages ?? []).filter(
        (m) => m.direction !== 'draft',
      );
      const messages: ReachMessageView[] = visible.map((m) => ({
        who: m.direction === 'sent' ? ('out' as const) : ('in' as const),
        t: m.body,
        at: formatAt(m.sentAt ?? m.createdAt),
      }));
      const draftRow = [...(thread?.messages ?? [])]
        .reverse()
        .find((m) => m.direction === 'draft');
      // 五态 = crmInfer 真值（纯函数现算；虚拟行 = 空事实 → pending_send）
      const status = inferCrmStatus({
        messages: (thread?.messages ?? []).map((m) => ({
          direction: m.direction,
        })),
        signals: signals
          .filter((s) => s.threadId === thread?.id)
          .map((s) => ({
            id: s.id,
            type: s.type,
            payload: s.payloadJson,
            detectedAt: s.detectedAt,
          })),
        quotes: (thread?.quotes ?? []).map((q) => ({ status: q.status })),
      }).status;
      const lastMsg = visible[visible.length - 1];
      return {
        kolId: kol.id,
        threadId: thread?.id ?? null,
        name: kol.displayName ?? kol.handle ?? kol.id,
        plat: formatPlat(kol.platform, kol.followers),
        status,
        stage: REACH_STATUS_LABEL[status],
        last: lastMsg?.body ?? (draftRow ? `草稿：${draftRow.body}` : ''),
        draft: draftRow
          ? { subject: draftRow.subject, body: draftRow.body }
          : null,
        messages,
        match: matchOf(kol.id),
        past: '—', // 本批无真数据源（guardrail：保留结构占位不删）
        hasContactEmail: !!kol.contactEmail,
        language: kol.language,
      };
    };

    const byKol = new Map<string, ReachPersonView>();
    for (const t of threads) byKol.set(t.kolId, buildPerson(t.kol, t));
    for (const m of approvedPlan?.kols ?? []) {
      if (!byKol.has(m.kolId)) byKol.set(m.kolId, buildPerson(m.kol, null));
    }

    // 排序：有往来的靠前（按最近消息时间），虚拟行按匹配分降序
    const people = [...byKol.values()].sort((a, b) => {
      const at = a.messages.length ? 1 : 0;
      const bt = b.messages.length ? 1 : 0;
      if (at !== bt) return bt - at;
      return (b.match ?? -1) - (a.match ?? -1);
    });

    return { people };
  } catch (err) {
    console.error('[reach/surface] 组装失败，降级空表:', err);
    return EMPTY_REACH_SURFACE;
  }
}
