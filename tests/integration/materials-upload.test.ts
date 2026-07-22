// M1-D-KNOWLEDGE F002 — 上传 API 集成测试（打真库 + 真磁盘（临时目录））。
//
// 为什么是集成测试：要验的是「route 端到端把文件落盘 + Material 落库 + 状态正确」——
// formData 解析、校验分支、落盘落库的编排只有整链才能证。
// 夹具自建自清（同 pending-action-columns 范式）：dev tenant 不存在则建（CI 无 seed），
// 本测试创建的 Game/Material/文件全部清理，不污染 dev 数据。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { prisma } from '../../src/lib/db/prisma';
import { POST, GET } from '../../src/app/api/materials/route';
import { resetUploadRateLimit } from '../../src/lib/knowledge/rate-limit';

let materialsDir: string;
let gameId: string;
let createdDevTenant = false;
let tenantId: string;

/** 只含 PNG 签名 + IHDR 的最小头（同 unit 测试夹具）。 */
function makePng(width: number, height: number): Buffer {
  const dim = Buffer.alloc(8);
  dim.writeUInt32BE(width, 0);
  dim.writeUInt32BE(height, 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([0, 0, 0, 13]),
    Buffer.from('IHDR'),
    dim,
    Buffer.from([8, 6, 0, 0, 0]),
    Buffer.from([0, 0, 0, 0]),
  ]);
}

function uploadRequest(opts: {
  fileName: string;
  bytes: Buffer;
  gameId?: string;
  type?: string;
}): Request {
  const fd = new FormData();
  fd.append(
    'file',
    new File([new Uint8Array(opts.bytes)], opts.fileName),
  );
  fd.append('gameId', opts.gameId ?? gameId);
  fd.append('type', opts.type ?? 'lore');
  return new Request('http://test.local/api/materials', {
    method: 'POST',
    body: fd,
  });
}

beforeAll(async () => {
  materialsDir = mkdtempSync(path.join(tmpdir(), 'm1d-int-'));
  process.env.MATERIALS_DIR = materialsDir;
  process.env.DISABLE_UPLOAD_RATELIMIT = '1'; // 进程内桶跨用例污染防护；限流已单测覆盖
  resetUploadRateLimit();

  // dev tenant：CI 裸库无 seed → 建之并记账；本地已有 → 复用不删
  const existing = await prisma.tenant.findUnique({ where: { slug: 'dev' } });
  if (existing) {
    tenantId = existing.id;
  } else {
    const t = await prisma.tenant.create({
      data: { slug: 'dev', name: 'dev tenant（集成测试夹具建）' },
    });
    tenantId = t.id;
    createdDevTenant = true;
  }
  const game = await prisma.game.create({
    data: { tenantId, name: 'F002 集成测试夹具游戏' },
  });
  gameId = game.id;
});

afterAll(async () => {
  await prisma.material.deleteMany({ where: { gameId } });
  await prisma.game.deleteMany({ where: { id: gameId } });
  if (createdDevTenant) {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }
  await prisma.$disconnect();
  delete process.env.MATERIALS_DIR;
  delete process.env.DISABLE_UPLOAD_RATELIMIT;
  rmSync(materialsDir, { recursive: true, force: true });
});

describe('POST /api/materials（上传落盘落库）', () => {
  it('txt 上传 → 201 + parseStatus=pending + 文件落盘 + 行落库', async () => {
    const res = await POST(
      uploadRequest({ fileName: '设定集.txt', bytes: Buffer.from('星轨协议世界观') }),
    );
    expect(res.status).toBe(201);
    const { material } = (await res.json()) as { material: { id: string; parseStatus: string; fileName: string; sizeBytes: number } };
    expect(material.parseStatus).toBe('pending');
    expect(material.fileName).toBe('设定集.txt');

    const row = await prisma.material.findUniqueOrThrow({
      where: { id: material.id },
    });
    expect(row.gameId).toBe(gameId);
    expect(row.tenantId).toBe(tenantId);
    expect(row.storageRef).toMatch(new RegExp(`^${gameId}/${row.id}-`));
    // 落盘实证：storageRef 指向的文件存在于临时根内
    expect(existsSync(path.join(materialsDir, row.storageRef))).toBe(true);
  });

  it('路径穿越形状的 gameId → 404（查无此游戏，不触盘）', async () => {
    const res = await POST(
      uploadRequest({
        fileName: 'a.txt',
        bytes: Buffer.from('x'),
        gameId: '../../etc',
      }),
    );
    expect(res.status).toBe(404);
  });

  it('超过 20MB → 413 拒（不落库）', async () => {
    const before = await prisma.material.count({ where: { gameId } });
    const res = await POST(
      uploadRequest({
        fileName: 'big.txt',
        bytes: Buffer.alloc(20 * 1024 * 1024 + 1),
      }),
    );
    expect(res.status).toBe(413);
    expect(await prisma.material.count({ where: { gameId } })).toBe(before);
  });

  it('小图（8×8 png）→ 400 拒 + 文案明示约束（不落库）', async () => {
    const before = await prisma.material.count({ where: { gameId } });
    const res = await POST(
      uploadRequest({ fileName: 'tiny.png', bytes: makePng(8, 8) }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('10px');
    expect(await prisma.material.count({ where: { gameId } })).toBe(before);
  });

  it('视频族（P6）→ 201 但落库即 failed + parseError 明示', async () => {
    const res = await POST(
      uploadRequest({
        fileName: '预告片.mp4',
        bytes: Buffer.from('fake video'),
        type: 'video',
      }),
    );
    expect(res.status).toBe(201);
    const { material } = (await res.json()) as { material: { parseStatus: string; parseError: string } };
    expect(material.parseStatus).toBe('failed');
    expect(material.parseError).toContain('暂不支持');
  });

  it('非法素材类型 → 400', async () => {
    const res = await POST(
      uploadRequest({ fileName: 'a.txt', bytes: Buffer.from('x'), type: 'bogus' }),
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /api/materials?gameId=（轮询列表）', () => {
  it('返回该游戏全部素材（含 parseStatus/parseError），按上传序', async () => {
    const res = await GET(
      new Request(`http://test.local/api/materials?gameId=${gameId}`),
    );
    expect(res.status).toBe(200);
    const { materials } = (await res.json()) as {
      materials: Array<{ fileName: string; parseStatus: string }>;
    };
    // 上面用例成功入库 2 条：txt（pending）+ mp4（failed）
    expect(materials.length).toBe(2);
    expect(materials[0].fileName).toBe('设定集.txt');
    expect(materials.map((m) => m.parseStatus)).toEqual(['pending', 'failed']);
  });

  it('缺 gameId → 400', async () => {
    const res = await GET(new Request('http://test.local/api/materials'));
    expect(res.status).toBe(400);
  });
});
