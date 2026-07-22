// M1-D-KNOWLEDGE F002 — 上传前置校验（边界输入校验层）。
//
// 三类结局（f002-smallimage-adjudication 裁决）：
// 1. 可解析类型（pdf/txt/md/csv/png/jpg/webp）→ 放行，parseStatus=pending 等待 F003 解析；
// 2. 仅存元数据类型（视频族，P6）→ 放行落库但 parseStatus=failed + parseError 明示
//    「类型暂不支持解析」——failed 可重试语义兼容未来能力升级（M2+ 深解析）；
// 3. 无效输入（白名单外类型 / >20MB / 图片最短边 ≤10px（vision 上游硬约束）/ 坏图）
//    → HTTP 400/413 拒收，不落盘不落库（P5：上传时校验优于解析时炸）。

import { imageSize } from 'image-size';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB
/** vision 上游硬约束（立项实测：最短边 ≤10px 报 InvalidParameter）。 */
export const MIN_IMAGE_SIDE_PX = 10;

/** 可解析类型：ext → mime（服务端按扩展名权威判定，不信任客户端 Content-Type）。 */
const PARSEABLE_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** 仅存元数据的视频族（P6：落库即 failed + parseError 明示，不解析）。 */
const METADATA_ONLY_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
};

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp']);

export const METADATA_ONLY_PARSE_ERROR =
  '类型暂不支持解析（视频等媒体格式，M2+ 能力升级后可重试）';

export type UploadValidation =
  | {
      ok: true;
      mimeType: string;
      /** false = 仅存元数据（落库即 failed，P6） */
      parseable: boolean;
    }
  | { ok: false; status: 400 | 413; error: string };

/** 从文件名取小写扩展名（无扩展名 → ''）。 */
function extOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : '';
}

/** 上传文件前置校验（P5/P6/P8 之外的全部边界规则）。 */
export function validateUploadFile(
  fileName: string,
  bytes: Buffer,
): UploadValidation {
  if (bytes.length === 0) {
    return { ok: false, status: 400, error: '空文件不可上传' };
  }
  if (bytes.length > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      status: 413,
      error: `文件超过 20MB 上限（实际 ${(bytes.length / 1024 / 1024).toFixed(1)}MB）`,
    };
  }

  const ext = extOf(fileName);
  const metadataOnly = METADATA_ONLY_MIME[ext];
  if (metadataOnly) return { ok: true, mimeType: metadataOnly, parseable: false };

  const mimeType = PARSEABLE_MIME[ext];
  if (!mimeType) {
    return {
      ok: false,
      status: 400,
      error: `不支持的文件类型 .${ext || '(无扩展名)'}（白名单：pdf/txt/md/csv/png/jpg/webp + 视频仅存元数据）`,
    };
  }

  if (IMAGE_EXTS.has(ext)) {
    let width = 0;
    let height = 0;
    try {
      const dim = imageSize(bytes);
      width = dim.width ?? 0;
      height = dim.height ?? 0;
    } catch {
      return { ok: false, status: 400, error: '图片文件损坏或无法解析尺寸' };
    }
    if (Math.min(width, height) <= MIN_IMAGE_SIDE_PX) {
      return {
        ok: false,
        status: 400,
        error: `图片最短边须 >${MIN_IMAGE_SIDE_PX}px（vision 上游约束，实际 ${width}×${height}）`,
      };
    }
  }

  return { ok: true, mimeType, parseable: true };
}
