// M1-D-KNOWLEDGE F002 — 素材文件存储通道（U2：本地盘 docker 卷）。
//
// storageRef 读写适配：根目录 env MATERIALS_DIR（dev 默认 ./.materials（gitignore），
// prod 挂卷 /app/materials，F006 compose 配套）。表只存元数据 + storageRef 相对路径，
// 文件本体不进 DB、不进 git。
//
// 路径穿越防护（双层）：
// 1. 写入侧：gameId 白名单化（cuid 形状硬校验）+ fileName basename 白名单化（unicode
//    字母/数字/._- 之外全部替换，'..' 无法存活）；
// 2. 读写侧：resolve 后强制断言仍在根目录内（belt-and-suspenders，任何上游漏网在此兜底）。

import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createId } from '@paralleldrive/cuid2';

/** 素材根目录（惰性读 env：测试可注入临时目录）。 */
export function materialsRoot(): string {
  return path.resolve(process.env.MATERIALS_DIR ?? '.materials');
}

/** cuid / cuid2 形状（Prisma @default(cuid()) 与 @paralleldrive/cuid2 均为小写字母数字）。 */
const CUID_SHAPE = /^[a-z0-9]{20,32}$/;

/** gameId 必须是 cuid 形状——它会成为磁盘目录名，任何路径元字符都不允许。 */
function assertGameIdShape(gameId: string): string {
  if (!CUID_SHAPE.test(gameId)) {
    throw new Error(`[knowledge/storage] 非法 gameId（须为 cuid 形状）: ${gameId}`);
  }
  return gameId;
}

/**
 * 文件名白名单化：取 basename 后仅保留 unicode 字母/数字/._-（CJK 素材名合法保留），
 * 其余替换为 '-'；'..' 序列在替换后无法构成路径回溯。空结果回退 'file'。
 */
export function sanitizeFileName(name: string): string {
  const base = path.basename(name).replace(/[^\p{L}\p{N}._-]/gu, '-');
  // 折叠连续点，杜绝 '..'（即便被 basename 放行也不能存活）
  const collapsed = base.replace(/\.{2,}/g, '.').replace(/^[.-]+/, '');
  return collapsed.length > 0 ? collapsed.slice(0, 120) : 'file';
}

/** resolve 后断言仍在根目录内（防护兜底层）。返回绝对路径。 */
export function resolveMaterialPath(storageRef: string): string {
  const root = materialsRoot();
  const abs = path.resolve(root, storageRef);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(
      `[knowledge/storage] storageRef 越出素材根目录（路径穿越拒绝）: ${storageRef}`,
    );
  }
  return abs;
}

export interface SavedMaterialFile {
  /** 生成的 cuid（兼作 Material.id，行与文件同源可溯） */
  id: string;
  /** MATERIALS_DIR 内相对路径：{gameId}/{cuid}-{safeName} */
  storageRef: string;
  /** 落盘绝对路径 */
  absolutePath: string;
}

/** 落盘：{gameId}/{cuid}-{safeName}。返回 id/storageRef 供落库。 */
export async function saveMaterialFile(
  gameId: string,
  fileName: string,
  bytes: Buffer,
): Promise<SavedMaterialFile> {
  const safeGame = assertGameIdShape(gameId);
  const id = createId();
  const storageRef = `${safeGame}/${id}-${sanitizeFileName(fileName)}`;
  const absolutePath = resolveMaterialPath(storageRef);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, bytes);
  return { id, storageRef, absolutePath };
}

/** 整读文件内容（F003 解析用：文本 decode / 图片 base64）。 */
export async function readMaterialBytes(storageRef: string): Promise<Buffer> {
  return readFile(resolveMaterialPath(storageRef));
}

/** 读取回条流（大文件 / 下载场景）。 */
export function createMaterialReadStream(storageRef: string): ReadStream {
  return createReadStream(resolveMaterialPath(storageRef));
}

/** 删除落盘文件（落库失败的回滚清理；文件不存在不抛错）。 */
export async function removeMaterialFile(storageRef: string): Promise<void> {
  await rm(resolveMaterialPath(storageRef), { force: true });
}
