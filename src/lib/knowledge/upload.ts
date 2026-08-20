// M1-D-KNOWLEDGE F002 — 上传前置校验（边界输入校验层）。
//
// 三类结局（f002-smallimage-adjudication 裁决）：
// 1. 可解析类型（pdf/txt/md/csv/png/jpg/webp）→ 放行，parseStatus=pending 等待 F003 解析；
// 2. 仅存元数据类型（视频族，P6）→ 放行落库但 parseStatus=failed + parseError 明示
//    「类型暂不支持解析」——failed 可重试语义兼容未来能力升级（M2+ 深解析）；
// 3. 无效输入（白名单外类型 / >20MB / 图片最短边 ≤10px（vision 上游硬约束）/ 坏图）
//    → HTTP 400/413 拒收，不落盘不落库（P5：上传时校验优于解析时炸）。

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

type ImageDimensions = { width: number; height: number };

function readPngDimensions(bytes: Buffer): ImageDimensions | null {
  const pngSignature = '89504e470d0a1a0a';
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== pngSignature) {
    return null;
  }
  if (bytes.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function readJpegDimensions(bytes: Buffer): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += length;
  }
  return null;
}

function readWebpDimensions(bytes: Buffer): ImageDimensions | null {
  if (
    bytes.length < 30 ||
    bytes.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    bytes.subarray(8, 12).toString('ascii') !== 'WEBP'
  ) {
    return null;
  }
  const chunk = bytes.subarray(12, 16).toString('ascii');
  if (chunk === 'VP8X' && bytes.length >= 30) {
    const width = 1 + bytes.readUIntLE(24, 3);
    const height = 1 + bytes.readUIntLE(27, 3);
    return { width, height };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    const width = bytes.readUInt16LE(26) & 0x3fff;
    const height = bytes.readUInt16LE(28) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (chunk === 'VP8L' && bytes.length >= 25) {
    const bits = bytes.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height };
  }
  return null;
}

function readImageDimensions(ext: string, bytes: Buffer): ImageDimensions | null {
  if (ext === 'png') return readPngDimensions(bytes);
  if (ext === 'jpg' || ext === 'jpeg') return readJpegDimensions(bytes);
  if (ext === 'webp') return readWebpDimensions(bytes);
  return null;
}

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
    const dim = readImageDimensions(ext, bytes);
    if (!dim) {
      return { ok: false, status: 400, error: '图片文件损坏或无法解析尺寸' };
    }
    const { width, height } = dim;
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
