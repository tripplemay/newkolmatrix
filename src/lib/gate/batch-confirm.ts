// M4.5-AGENT-LOOP F007 — 批量确认执行器（F-D「批量备好聚合确认面」的动作面）
//
// ── 为什么没有批量端点（红线）──
// 「批量确认」在这里的实现**就是前端逐项调既有的两步票据端点**：
//   POST /api/actions/{id}/confirm → 拿一次性执行票 → POST /api/actions/{id}/execute { ticket }
// 一个 `POST /api/actions/batch-confirm` 会立刻成为闸门的绕过面：一次调用消费 N 张票、
// N 个不可逆副作用，并发/幂等/部分失败的语义全要重写一遍——而两步票据的所有保证
//（原子条件 UPDATE 消双确认、票据一次性、副作用恰好一次）都得重新证明一次。
// 逐项循环则一个保证都不用重证。回归测试 grep 钉死「不得新增批量端点」。
//
// ── 部分失败必须如实分项 ──
// 任何一项失败都不中断后续项，且**保留原始错误文案**（不归一成「操作失败」）——
// 「成功 3 件、失败 1 件（GATE_EXPIRED 确认已过期）」才是可行动的信息。

export type BatchStage = 'confirm' | 'execute' | 'done';

export interface BatchItemResult {
  id: string;
  ok: boolean;
  /** 失败发生在哪一步（成功时为 'done'）。 */
  stage: BatchStage;
  /** 服务端错误原文（不改写、不归一）；成功为 null。 */
  error: string | null;
  /** 服务端错误码（如 GATE_EXPIRED / GATE_ALREADY_DECIDED）；无则 null。 */
  code: string | null;
}

export interface BatchConfirmResult {
  succeeded: number;
  failed: number;
  items: BatchItemResult[];
}

export interface PostResponse {
  ok: boolean;
  status: number;
  body: Record<string, unknown> | null;
}

/** 传输注入缝（默认走真 fetch；测试注入以直驱路由处理器）。 */
export type BatchPost = (
  url: string,
  body?: Record<string, unknown>,
) => Promise<PostResponse>;

const defaultPost: BatchPost = async (
  url: string,
  body?: Record<string, unknown>,
): Promise<PostResponse> => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const parsed = (await res.json().catch((): null => null)) as Record<
    string,
    unknown
  > | null;
  return { ok: res.ok, status: res.status, body: parsed };
};

function errorOf(res: PostResponse): { error: string; code: string | null } {
  const raw = res.body?.error;
  const code = typeof res.body?.code === 'string' ? res.body.code : null;
  return {
    error: typeof raw === 'string' && raw ? raw : `HTTP ${res.status}`,
    code,
  };
}

/**
 * 逐项走完两步票据闸门。失败项不中断后续项，逐项如实回报。
 * @param ids 待确认动作 id（顺序即执行顺序）
 */
export async function confirmAndExecuteSequentially(
  ids: string[],
  post: BatchPost = defaultPost,
): Promise<BatchConfirmResult> {
  const items: BatchItemResult[] = [];
  for (const id of ids) {
    // ① 签票
    const confirmed = await post(`/api/actions/${id}/confirm`);
    if (!confirmed.ok) {
      items.push({ id, ok: false, stage: 'confirm', ...errorOf(confirmed) });
      continue;
    }
    const ticket = confirmed.body?.ticket;
    if (typeof ticket !== 'string' || !ticket) {
      items.push({
        id,
        ok: false,
        stage: 'confirm',
        error: '确认响应未返回执行票',
        code: null,
      });
      continue;
    }
    // ② 消费票执行（副作用只在这里发生）
    const executed = await post(`/api/actions/${id}/execute`, { ticket });
    if (!executed.ok) {
      items.push({ id, ok: false, stage: 'execute', ...errorOf(executed) });
      continue;
    }
    items.push({ id, ok: true, stage: 'done', error: null, code: null });
  }
  return {
    succeeded: items.filter((i) => i.ok).length,
    failed: items.filter((i) => !i.ok).length,
    items,
  };
}
