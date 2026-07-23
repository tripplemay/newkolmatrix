// M2-B-CREATORS F001 — apify-kol GET /kol 响应 zod 契约（外部 API，宽容取向）。
//
// v0.9.19 铁律：形状按真样本 pin（tests/fixtures/apify-kol-samples.json，2026-07-23
// 四平台实测；YT qualityScore 恒 null / IG businessCategory 可空串 / following 可 null /
// matchedTags 可空数组）。**passthrough 容忍未知字段**——上游独立演进（monorepo
// guang-tech/apify），新增字段不得打死同步；缺字段/形状漂移走 nullable 宽容而非硬拒。
//
// 只声明本批消费的字段子集为具名键；未消费字段经 passthrough 原样携带（不建模不假设）。

import { z } from 'zod';

/** 单个 KOL 行（消费子集 + passthrough）。 */
export const apifyKolRowSchema = z
  .object({
    id: z.string(),
    platform: z.string(), // instagram|tiktok|youtube|x；上游可扩，不锁枚举
    platformUserId: z.string(),
    username: z.string(),
    displayName: z.string().nullish(),
    bio: z.string().nullish(),
    avatarUrl: z.string().nullish(),
    profileUrl: z.string().nullish(),
    followers: z.number().nullish(),
    following: z.number().nullish(),
    postsCount: z.number().nullish(),
    totalLikes: z.number().nullish(), // ⚠️ 跨平台语义不一致（TT 真值/IG 估算/YT=views 平替/X 曝光估算）
    totalViews: z.number().nullish(),
    verified: z.boolean().nullish(),
    isBusinessAccount: z.boolean().nullish(),
    isPrivate: z.boolean().nullish(),
    businessCategory: z.string().nullish(), // IG 专有；真样本可为空串
    location: z.string().nullish(), // YT 专有（创作者国家，~83% 填充）
    joinedDate: z.string().nullish(),
    hasBusinessEmail: z.boolean().nullish(),
    matchedTags: z.array(z.string()).nullish(),
    matchedKeywords: z.array(z.string()).nullish(),
    // 4 维评分（0-1）；YT qualityScore 恒 null（真样本 pin）
    relevanceScore: z.number().nullish(),
    influenceScore: z.number().nullish(),
    qualityScore: z.number().nullish(),
    reachabilityScore: z.number().nullish(),
    tier: z.string().nullish(), // hot|warm|cold；上游可扩，不锁枚举
    lastScrapedAt: z.string().nullish(),
  })
  .passthrough();

export type ApifyKolRow = z.infer<typeof apifyKolRowSchema>;

/** GET /kol 分页信封（真样本：{data,page,pageSize,total}）。 */
export const apifyKolListResponseSchema = z
  .object({
    data: z.array(apifyKolRowSchema),
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
  })
  .passthrough();

export type ApifyKolListResponse = z.infer<typeof apifyKolListResponseSchema>;
