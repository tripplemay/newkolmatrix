// M3-A-REACH-CRM F007 — Kol.contactEmail 人工录入服务（P3：抽屉录入口是唯一写入路径，
// 不做自动采集）。send_outreach（F003）的收件地址读侧即本列——未录入明示拒绝不猜。
//
// fieldProvenance 合并写（immutable）：只增/删 contactEmail 一个键，其余字段级溯源
// 原样保留——整体覆盖会抹掉 seed/derive 已写的 audienceDemo 等键（D15 溯源是差异化
// 核心，丢键即事故）。写入形状必须是 fieldProvenanceEntrySchema 的条目对象
// {source:'user_input', fetchedAt}：写 flat 字符串会让 fieldProvenanceSchema 整表
// safeParse 失败 → 该行全部字段级溯源降级 row/fallback（provenance.ts readContractSlot 语义）。
//
// 清除语义：email=null/空串 → 列置空 + fieldProvenance.contactEmail 键一并移除
//（读写不对称 §7.5.2：值缺失 → 不渲染溯源徽标；残留孤儿键会造出「有溯源无数据」矛盾态）。
//
// ⚠️ P1（M3-A spec §3）：真实 KOL 行不得写入测试地址——测试/验收只对夹具行或
// VK-FULL 白名单行录入 OUTREACH_TEST_RECIPIENT。本服务不区分行来源（demo 阶段
// 无「真实/夹具」列标），纪律由录入口注释与验收流程约束。

import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from 'lib/db/prisma';

/** 坏格式明示文案（route 400 与测试断言共用锚点） */
export const CONTACT_EMAIL_INVALID_MSG =
  'contactEmail 格式不合法：须为有效邮箱地址（或传 null / 空串清除）';

const emailSchema = z.email();

export type NormalizedContactInput =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/** 归一化录入值（纯函数，route 调用）：trim 后空串/null = 清除；非空须过 email 校验。 */
export function normalizeContactEmailInput(
  raw: string | null,
): NormalizedContactInput {
  if (raw === null) return { ok: true, value: null };
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: null };
  if (!emailSchema.safeParse(trimmed).success) {
    return { ok: false, error: CONTACT_EMAIL_INVALID_MSG };
  }
  return { ok: true, value: trimmed };
}

export type SetContactEmailResult =
  | { ok: true; contactEmail: string | null }
  | { ok: false; code: 'NOT_FOUND' };

/**
 * 录入（email 非空）或清除（email=null）联系邮箱，fieldProvenance 同步合并写。
 * email 应已过 normalizeContactEmailInput（本函数不重复格式校验）。
 */
export async function setKolContactEmail(
  tenantId: string,
  kolId: string,
  email: string | null,
): Promise<SetContactEmailResult> {
  const kol = await prisma.kol.findFirst({
    where: { id: kolId, tenantId },
    select: { id: true, fieldProvenance: true },
  });
  if (!kol) return { ok: false, code: 'NOT_FOUND' };

  // 现有 fieldProvenance 非对象形状（null / 数组 / 标量脏数据）按空表处理——
  // 读侧 readContractSlot 对其同样降级，不因写入路径抛错（D2 不打死）。
  const existing: Record<string, unknown> =
    kol.fieldProvenance !== null &&
    typeof kol.fieldProvenance === 'object' &&
    !Array.isArray(kol.fieldProvenance)
      ? (kol.fieldProvenance as Record<string, unknown>)
      : {};

  let next: Record<string, unknown>;
  if (email !== null) {
    // immutable 合并：条目对象形状（fieldProvenanceEntrySchema），confidence 缺省 null
    next = {
      ...existing,
      contactEmail: {
        source: 'user_input',
        fetchedAt: new Date().toISOString(),
      },
    };
  } else {
    const { contactEmail: _removed, ...rest } = existing;
    void _removed;
    next = rest;
  }

  await prisma.kol.update({
    where: { id: kol.id },
    data: {
      contactEmail: email,
      // 清除后无剩余键 → 回落 SQL NULL（不留空对象壳）
      fieldProvenance:
        Object.keys(next).length > 0
          ? (next as Prisma.InputJsonValue)
          : Prisma.DbNull,
    },
  });
  return { ok: true, contactEmail: email };
}
