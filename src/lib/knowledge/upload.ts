// M1-D-KNOWLEDGE F002 — 上传前置校验（边界输入校验层）。
//
// 三类结局（f002-smallimage-adjudication 裁决）：
// 1. 可解析类型（pdf/txt/md/csv/png/jpg/webp）→ 放行，parseStatus=pending 等待 F003 解析；
// 2. 仅存元数据类型（视频族，P6）→ 放行落库但 parseStatus=failed + parseError 明示
//    「类型暂不支持解析」——failed 可重试语义兼容未来能力升级（M2+ 深解析）；
// 3. 无效输入（白名单外类型 / >20MB / 图片最短边 ≤10px（vision 上游硬约束）/ 坏图）
//    → HTTP 400/413 拒收，不落盘不落库（P5：上传时校验优于解析时炸）。

type ImageDimensions = { width: number; height: number };

function readPngDimensions(bytes: Buffer): ImageDimensions | null {
  if (
    bytes.length < 24 ||
    bytes.readUInt32BE(0) !== 0x89504e47 ||
    bytes.readUInt32BE(4) !== 0x0d0a1a0a ||
    bytes.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    return null;
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function readJpegDimensions(bytes: Buffer): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd9 || marker === 0xda) return null;
    if (offset + 2 > bytes.length) return null;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    const isSofMarker =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSofMarker) {
      if (segmentLength < 7) return null;
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }
  return null;
}

function readWebpDimensions(bytes: Buffer): ImageDimensions | null {
  if (
    bytes.length < 30 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L' && bytes.length >= 25) {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  if (chunk === 'VP8X' && bytes.length >= 30) {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }
  return null;
}

function readImageDimensions(ext: string, bytes: Buffer): ImageDimensions | null {
  if (ext === 'png') return readPngDimensions(bytes);
  if (ext === 'jpg' || ext === 'jpeg') return readJpegDimensions(bytes);
  if (ext === 'webp') return readWebpDimensions(bytes);
  return null;
}

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
    const dim = readImageDimensions(ext, bytes);
    if (!dim) {
      return { ok: false, status: 400, error: '图片文件损坏或无法解析尺寸' };
    }
    width = dim.width;
    height = dim.height;
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
