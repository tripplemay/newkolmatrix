// M5-AUTH-RLS F004（spec D-3）— 集成测试的**会话注入缝**。
//
// 【为什么需要它】F004 之后，route / RSC 的租户来自登录会话（`lib/auth/session-tenant`），
// 而 vitest 直调 route handler 的测试跑在**没有 Next 请求作用域**的进程里：`auth()` 拿不到
// cookie，甚至连请求作用域都没有。不给它们一个会话，这些测试证明的就只是「未登录会失败」。
//
// 【纪律：注入即无条件使用】被注入的模块**不做任何凭据判定**——给了身份就是那个身份，
// 给了空租户就是「没有会话」。不得出现「测试环境下自动回落 dev 租户」之类的分支：
// 那正是 spec D-3 要杜绝的静默改道，且会让负向断言（未登录 → 失败关闭）永远测不到真路径。
//
// 【为什么不做成全局 setupFile】全局注入 = 每个测试都自动有会话，
// 「某个 route 忘了要会话」将永远不会被任何测试发现。故只在**显式声明**的文件里生效。
//
// 用法（vi.mock 工厂被提升到 import 之前，故支点必须走 vi.hoisted）：
//
//   const sessionSeam = vi.hoisted(() => ({ tenantId: '', actor: 'probe@test.local' }));
//   vi.mock('lib/auth/session-tenant', async (importOriginal) => {
//     const actual = await importOriginal<
//       typeof import('../../src/lib/auth/session-tenant')
//     >();
//     const { makeSessionTenantMock } = await import('../support/session-mock');
//     return makeSessionTenantMock(actual, sessionSeam);
//   });
//   // beforeAll: sessionSeam.tenantId = <夹具租户 id>；置空 = 模拟未登录

import type * as SessionTenantModule from '../../src/lib/auth/session-tenant';

/** 可变支点：用例可在运行中改写，mock 每次调用都重读（同 loop 测试床 injected 范式）。 */
export interface SessionSeam {
  /** 空串 = 当前请求**没有会话**（负向路径）。 */
  tenantId: string;
  actor?: string;
}

export function makeSessionTenantMock(
  actual: typeof SessionTenantModule,
  seam: SessionSeam,
): typeof SessionTenantModule {
  const read = (): SessionTenantModule.SessionIdentity | null =>
    seam.tenantId
      ? { tenantId: seam.tenantId, actor: seam.actor ?? 'probe@test.local' }
      : null;

  return {
    ...actual,
    readSessionIdentity: async () => read(),
    requireSessionIdentity: async () => {
      const identity = read();
      // 与生产实现同一失败语义（同一错误类），负向断言因此对两边同时有效
      if (!identity) throw new actual.MissingSessionTenantError();
      return identity;
    },
    requireSessionTenantId: async () => {
      const identity = read();
      if (!identity) throw new actual.MissingSessionTenantError();
      return identity.tenantId;
    },
  };
}
