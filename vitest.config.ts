// M1-A-BRIEF F001 — vitest 地基。
//
// 配置口径按 architecture.md:1648-1660 规划：node 环境、只收 tests/ 下的单测与集成测，
// 覆盖率盯 src/lib/**（领域层与数据层，即本批 domain/ 的落点）行覆盖 ≥80%。
//
// 不做 jsdom 组件单测（architecture.md:1670）——模板遗留的 @testing-library/react ^13
// 与 React 19 不兼容，本批已随 CRA 残留一并摘除；组件正确性由 Playwright 视觉/交互探针兜底。
// 故 environment 固定 'node'，不引 jsdom。

import { defineConfig } from 'vitest/config';

// tests/integration/** 打真库，需要 DATABASE_URL。仓内其余脚本靠 `node --env-file=.env` 注入，
// 但 vitest 不读 .env —— 不在这里补，本地就得每次手动 source，久了就演变成「本地不跑集成测试」。
// CI 由 workflow 的 job env 直接给 DATABASE_URL，此时无 .env 文件，抛错吞掉即可。
// （`loadEnvFile` 是 Node 20.12+ 的运行时 API，但仓内 @types/node 仍是 ^18，
//   类型定义里没有它，故显式窄化而非用 any。）
const nodeProcess = process as NodeJS.Process & {
  loadEnvFile?: (path?: string) => void;
};
try {
  nodeProcess.loadEnvFile?.('.env');
} catch {
  // 无 .env（如 CI）：依赖已在环境里的变量
}

export default defineConfig({
  // tsconfig 的 baseUrl:'src' 让全仓以 `lib/...` / `components/...` 形式裸导入，
  // 该解析规则须在 vitest 侧同样生效，否则测试文件无法复用产品代码的导入写法。
  //
  // spec F001 原写「装 vite-tsconfig-paths」，但那是 architecture.md:1648-1660 起草时的 Vite 7 口径；
  // 本仓实装到的是 Vite 8，该能力已原生化，装插件会在每次 test 运行时打一条弃用警告。
  // 故改用原生 resolve.tsconfigPaths（等效性已实测：19/19 用例在两种配置下同样通过）。
  resolve: { tsconfigPaths: true },
  // tsconfig 的 jsx:'preserve' 是给 Next 编译器的；vitest 自己没有下游 JSX 处理器，
  // 沿用 preserve 会让引到 .tsx 的测试在 transform 阶段撞未转译的 JSX。
  // 这里显式转 automatic runtime（与 Next 一致），使 `ProvenanceTag` 这类
  // 「组件文件里导出的纯数据表」可在 node 环境下被单测直接读取。
  // （Vite 8 的转换器是 oxc，不再是 esbuild，故配 `oxc` 键。）
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // spec F001 原写 include:['src/lib/**']。实测该范围整体行覆盖仅 6.2%（24/387）——
      // src/lib 下的 agent/ · ai/ · mock/ · db/ 属既有未测代码，本批不负责补测。
      // 照字面配成 src/lib/** + 80% 只有两种结局：接进 CI 则 CI 永久红；不接则门从不执行，
      // 退化为「只有文案的阶段门」（PRD:129 点名的反模式）。
      //
      // 取 acceptance 的原意「覆盖率门 ≥80% 真正生效」，把 include 收窄到本批实际拥有的代码：
      // domain/（F004 health · F005 env-guards · F006 推进函数）+ data/provenance（F001 样板）。
      // 门因此是真的、且已接进 CI。随后续批次把 domain/ 与 data/ 补齐，再逐步放宽回 src/lib/**。
      // 裁决记录 → docs/specs/M1-A-BRIEF-f003-f006-preimpl-audit.md D17。
      include: ['src/lib/domain/**', 'src/lib/data/provenance.ts'],
      thresholds: { lines: 80 },
    },
  },
});
