// M5-AUTH-RLS F007 修复回归 — 喂给 psql 的连接串必须先剥掉 Prisma 专用查询参数。
//
// 【这条钉是怎么来的】F007 首版的 CI「Create non-privileged app role」步整步失败：
//   psql: error: invalid URI query parameter: "schema"   （exit 2）
// 因为仓内 DATABASE_URL 是 **Prisma 形态**（`?schema=public`），而 psql 只认 libpq 参数。
// 本机没撞见，是因为本机没装 psql、bootstrap 走的是 docker exec 通道——
// **同一个脚本的两条通道入参形态不同，只测其中一条就会漏掉这一类问题**。
//
// 【为什么用子进程跑真脚本而不是在 TS 里重写一遍剥离逻辑】重写一遍等于把断言对准副本：
// 副本永远和自己一致，脚本改坏了它也不红。这里调的是脚本自己的 `--print-psql-url` 自检口，
// 断言的就是生产路径上真正会被交给 psql 的那条串。

import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function psqlUrlOf(input: string): string {
  return execFileSync(
    'bash',
    ['scripts/db/bootstrap-app-role.sh', '--print-psql-url', input],
    { encoding: 'utf8' },
  ).trim();
}

describe('F007 bootstrap：连接串在交给 psql 之前剥掉 Prisma 专用参数', () => {
  it('CI 的那条串（?schema=public）剥完不再带任何查询参数', () => {
    expect(
      psqlUrlOf('postgresql://postgres:postgres@localhost:5432/kolmatrix?schema=public'),
    ).toBe('postgresql://postgres:postgres@localhost:5432/kolmatrix');
  });

  it('libpq 认识的参数必须保留（sslmode 丢了会把生产连接从加密降级）', () => {
    expect(
      psqlUrlOf('postgresql://kol:pw@db:5432/kolmatrix?schema=public&sslmode=require'),
    ).toBe('postgresql://kol:pw@db:5432/kolmatrix?sslmode=require');
  });

  it('其余 Prisma 专用参数一并剥（connection_limit / pool_timeout / pgbouncer）', () => {
    expect(
      psqlUrlOf(
        'postgresql://kol:pw@db:5432/kolmatrix?connection_limit=5&pool_timeout=10&pgbouncer=true&sslmode=require',
      ),
    ).toBe('postgresql://kol:pw@db:5432/kolmatrix?sslmode=require');
  });

  it('没有查询串的连接串原样透传（不制造多余的 ?）', () => {
    expect(psqlUrlOf('postgresql://kol:pw@db:5432/kolmatrix')).toBe(
      'postgresql://kol:pw@db:5432/kolmatrix',
    );
  });

  it('口令里的特殊字符不被这层处理破坏（剥离只动查询串，不碰 userinfo）', () => {
    const url = 'postgresql://kol:p%40ss%3Aword@db:5432/kolmatrix?schema=public';
    expect(psqlUrlOf(url)).toBe('postgresql://kol:p%40ss%3Aword@db:5432/kolmatrix');
  });
});
