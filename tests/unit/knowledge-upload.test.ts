// M1-D-KNOWLEDGE F002 — 存储通道 / 上传校验 / rate-limit 单测。
//
// 覆盖 acceptance：路径穿越防护（sanitize + resolve 双层）· 类型白名单 · 20MB 超限 ·
// 小图拒（P5，f002-smallimage-adjudication 方案 A）· 视频族仅存元数据（P6）·
// rate-limit 三案例（窗口内放行 / 超限拒 + Retry-After / escape env 关断，P8）。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  sanitizeFileName,
  resolveMaterialPath,
  saveMaterialFile,
  readMaterialBytes,
  materialsRoot,
} from '../../src/lib/knowledge/storage';
import {
  validateUploadFile,
  MAX_UPLOAD_BYTES,
  METADATA_ONLY_PARSE_ERROR,
} from '../../src/lib/knowledge/upload';
import {
  rateLimitUpload,
  resetUploadRateLimit,
} from '../../src/lib/knowledge/rate-limit';

/** 只含 PNG 签名 + IHDR 的最小头（image-size 只读头，够用）。 */
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

const GAME_ID = 'ck0000000000000000000001'; // cuid 形状

describe('storage：路径穿越防护（双层）', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'm1d-storage-'));
    process.env.MATERIALS_DIR = dir;
  });
  afterEach(() => {
    delete process.env.MATERIALS_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  it('sanitizeFileName：../ 与路径分隔符无法存活，CJK 保留', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('..\\..\\boot.ini')).not.toContain('..');
    expect(sanitizeFileName('玩法深度解析 v2.pdf')).toBe('玩法深度解析-v2.pdf');
    expect(sanitizeFileName('...')).toBe('file');
  });

  it('resolveMaterialPath：越出根目录 → 抛错拒绝', () => {
    expect(() => resolveMaterialPath('../outside.txt')).toThrow(/路径穿越/);
    expect(() => resolveMaterialPath('a/../../outside.txt')).toThrow(/路径穿越/);
    // 合法相对路径通过且在根内
    const ok = resolveMaterialPath(`${GAME_ID}/x-file.txt`);
    expect(ok.startsWith(materialsRoot())).toBe(true);
  });

  it('saveMaterialFile：非 cuid 形状 gameId（路径元字符）→ 抛错', async () => {
    await expect(
      saveMaterialFile('../evil', 'a.txt', Buffer.from('x')),
    ).rejects.toThrow(/非法 gameId/);
  });

  it('saveMaterialFile 落盘 + readMaterialBytes 往返；storageRef = {gameId}/{cuid}-{safeName}', async () => {
    const saved = await saveMaterialFile(
      GAME_ID,
      '设定集 v2.pdf',
      Buffer.from('content'),
    );
    expect(saved.storageRef).toMatch(
      new RegExp(`^${GAME_ID}/[a-z0-9]{20,32}-设定集-v2\\.pdf$`),
    );
    expect((await readMaterialBytes(saved.storageRef)).toString()).toBe(
      'content',
    );
  });
});

describe('upload 校验（白名单 / 超限 / 小图 / 视频族）', () => {
  it('可解析类型放行 + 服务端权威 mime', () => {
    const r = validateUploadFile('notes.md', Buffer.from('# hi'));
    expect(r).toEqual({ ok: true, mimeType: 'text/markdown', parseable: true });
  });

  it('白名单外类型 → 400 拒', () => {
    const r = validateUploadFile('evil.exe', Buffer.from('MZ'));
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.status).toBe(400);
  });

  it('超过 20MB → 413 拒（超限拒）', () => {
    const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
    const r = validateUploadFile('big.txt', big);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.status).toBe(413);
  });

  it('小图拒（P5 裁决方案 A）：最短边 ≤10px → 400；>10px 放行', () => {
    const small = validateUploadFile('tiny.png', makePng(8, 100));
    expect(small.ok).toBe(false);
    if (small.ok === false) {
      expect(small.status).toBe(400);
      expect(small.error).toContain('10px');
    }
    const okImg = validateUploadFile('ok.png', makePng(32, 32));
    expect(okImg.ok).toBe(true);
  });

  it('坏图（无法解析尺寸）→ 400 拒', () => {
    const r = validateUploadFile('broken.png', Buffer.from('not a png'));
    expect(r.ok).toBe(false);
  });

  it('视频族仅存元数据（P6）：放行但 parseable=false + 明示文案存在', () => {
    const r = validateUploadFile('trailer.mp4', Buffer.from('fake video'));
    expect(r).toEqual({ ok: true, mimeType: 'video/mp4', parseable: false });
    expect(METADATA_ONLY_PARSE_ERROR).toContain('暂不支持');
  });
});

describe('rate-limit（P8 三案例）', () => {
  beforeEach(() => resetUploadRateLimit());
  afterEach(() => {
    delete process.env.DISABLE_UPLOAD_RATELIMIT;
    resetUploadRateLimit();
  });

  it('窗口内前 10 次放行，第 11 次拒 + Retry-After', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 10; i++) {
      expect(rateLimitUpload('t1', () => t0 + i * 100).allowed).toBe(true);
    }
    const r = rateLimitUpload('t1', () => t0 + 2_000);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
    // 窗口滑过（60s 后）恢复放行
    expect(rateLimitUpload('t1', () => t0 + 61_000).allowed).toBe(true);
  });

  it('tenant 维度隔离：t1 打满不影响 t2', () => {
    const t0 = 2_000_000;
    for (let i = 0; i < 10; i++) rateLimitUpload('t1', () => t0);
    expect(rateLimitUpload('t1', () => t0).allowed).toBe(false);
    expect(rateLimitUpload('t2', () => t0).allowed).toBe(true);
  });

  it('escape：DISABLE_UPLOAD_RATELIMIT=1 全放行', () => {
    process.env.DISABLE_UPLOAD_RATELIMIT = '1';
    const t0 = 3_000_000;
    for (let i = 0; i < 30; i++) {
      expect(rateLimitUpload('t1', () => t0).allowed).toBe(true);
    }
  });
});
