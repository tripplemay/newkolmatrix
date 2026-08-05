// M5-AUTH-RLS F001（spec §5 数据准备）— dev / CI 测试用户口令 seed。
//
// 给 dev 租户的既有用户（AGENT-FOUNDATION F004 seed 的 dev@newkolmatrix.local）补 passwordHash，
// 使 F002 登录页、F012 的 playwright storageState 与各 e2e 有一份**已知凭据**可用。
// 幂等：重复跑只重算摘要（bcrypt 每次 salt 不同，属预期）。
// **生产禁建**：assertDevSeedAllowed 在 NODE_ENV=production 直接抛错（判定在 lib，被单测钉住）。
//
// 运行：npm run seed:dev-user

import { DEV_TENANT_SLUG, systemTenantId } from '../../src/lib/agent/context';
import { prisma } from '../../src/lib/db/prisma';
import {
  assertDevSeedAllowed,
  resolveDevTestUserCredentials,
} from '../../src/lib/auth/dev-seed';
import { hashPassword } from '../../src/lib/auth/password';

async function main(): Promise<void> {
  assertDevSeedAllowed();

  const { email, password } = resolveDevTestUserCredentials();
  const tenantId = await systemTenantId(DEV_TENANT_SLUG);
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, tenantId, name: 'Dev User', passwordHash },
    select: { id: true, email: true },
  });

  // 只打邮箱与结果，绝不打口令（D-4 隐私纪律：口令任何形态都不进日志）。
  console.log(
    `[seed:dev-user] ✅ 测试用户就绪 id=${user.id} email=${user.email}（口令见 DEV_TEST_USER_PASSWORD / lib/auth/dev-seed.ts 默认值）`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[seed:dev-user] ❌', err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
