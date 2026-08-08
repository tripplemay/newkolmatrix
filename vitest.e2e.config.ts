// M5.1b-TENANT-INJECTION F006 — 最小闭环 e2e 的**独立**收集配置。
//
// 【为什么另开一份 config 而不是塞进 vitest.config.ts 的 include】
// 这一套用例的运行前提与其余 148 个测试文件**相反**：它要求 `DB_APP_ROLE_RUNTIME=1` +
// 连 kol_app（RLS 真实生效）。放进默认收集范围只有两种结局——
//   · 默认 `npm run test:unit` 带着它跑 → 本机/CI 没有 kol_app 时永久红；
//   · 给它加「环境不齐就 skip」→ 静默跳过的隔离测试比没有测试更危险（本仓一贯口径：
//     F001/F002/F005 都是缺环境**抛错**而不是 skip）。
// 独立 config 让「不进默认收集范围」成为**结构事实**（include 根本不含 tests/e2e/），
// 而不是一句注释或一个运行时判断。入口：`npm run rls:e2e`。
//
// 【为什么是「展开 + 覆盖」而不是 `mergeConfig`】实测：`mergeConfig` 对数组是**拼接**，
// 于是 include 变成「默认 148 个文件 + 本套 e2e」，一跑就把整个默认测试面拖进
// 开关打开的进程里（那些文件的前提正是「开关关」）—— 首跑实测 83 个文件红。
// 这里要的是**替换** include，故显式展开 base 再覆盖 test 段。
//
// spec §5.1 的硬约束：**不得修改 .env 默认值**（改了会污染其余全部测试文件的运行前提）。
// 故开关只在 package.json 那条 script 里以**进程级 env 前缀**给出。

import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['tests/e2e/**/*.e2e.test.ts'],
    // 打真库 + bcrypt cost 12（注册段真算摘要，不注入假 hash）→ 默认 5s 不够。
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // 覆盖率门是给默认测试面定的（vitest.config.ts 里 include 收窄到 domain/），
    // 这一套只跑六段闭环，不该被那个门评判。
    coverage: { enabled: false },
  },
});
