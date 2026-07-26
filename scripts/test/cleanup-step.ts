// M4.7-FRONTDESK F011 — 清理步骤包装（从两个 e2e 脚本抽出，供行为级单测）
//
// 【S-RV1-1/2/3 收口】M4.6 复验实测：给清理段加的三条**源码级正则**断言全部可被
// 写法绕过，且绕过后**行为等价于原缺陷**：
//   ① catch 里改 `return Promise.reject(err)` —— 绕过「catch 内无 throw」
//   ② 跨行 `await prisma.x` ⏎ `.deleteMany(` —— 绕过「无裸 deleteMany」
//   ③ `.filter(() => true)` —— 绕过「id 必经 filter」
// 规律：源码级正则的强度取决于你能想到多少种写法；**行为级断言天然免疫写法**。
// 故把包装器导出，用「喂一个必抛的 fn，断言它正常 resolve」直接钉行为契约。

/**
 * 清理步骤包装：吞掉自身异常并喊出来，**绝不向外抛**。
 *
 * 清理段跑在 finally 里。它一抛，两件事同时发生：主流程的首因（ASSERT FAIL 原文）
 * 被二次抛错覆盖；后续清理步骤全部被跳过 → 残留污染 dev 库。而 e2e 失败在 fixing
 * 轮里是常态——那正是清理最需要生效的时刻。来源：M4.5 首轮验收 F010 缺陷 ①。
 */
export async function cleanupStep(
  label: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(
      `  ⚠ 清理步骤失败（不中断后续清理）：${label} — ${
        err instanceof Error ? err.message : err
      }`,
    );
  }
}
