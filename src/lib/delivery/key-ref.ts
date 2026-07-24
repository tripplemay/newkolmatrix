// M3-B-DELIVERY F006 — keyRef 明文守卫（纯函数，P8）
//
// `GameKey.keyRef` 存的是**引用**（key 池条目号 / 外部批次号），**不是明文 key 值**
// （schema.prisma GameKey 注释同口径）。理由：明文 key 一旦入库就进了备份、日志与任何
// 读得到该表的地方——而系统对 key 的职责只是「记录发给了谁、什么时候、经谁确认」。
//
// 本守卫在**写入口**（F008 key 池登记）与**分发前**（F006）各拦一次：
// 形如 `AAAAA-BBBBB-CCCCC` 的典型激活码一律拒绝，明示要求改填引用。
// 这是保守的形状识别，不可能覆盖所有 key 格式——所以它是防呆而非安全边界，
// 真正的边界是「录入口只让人填引用」这条产品约定。

/** 典型激活码形状：≥3 段、每段 4-6 位大写字母数字、短横分隔（Steam / Epic / GOG 同款）。 */
const PLAINTEXT_KEY_SHAPE = /^[A-Z0-9]{4,6}(-[A-Z0-9]{4,6}){2,}$/;

export const PLAINTEXT_KEY_REJECT_MSG =
  'keyRef 看起来是明文激活码——本表只存引用不存明文 key 值（P8）。请改填 key 池条目号或批次引用。';

/** 是否形似明文激活码。 */
export function looksLikePlaintextKey(ref: string): boolean {
  return PLAINTEXT_KEY_SHAPE.test(ref.trim());
}

/** 形似明文 key 则抛错（写入口与分发前各调一次）。 */
export function assertKeyRefNotPlaintext(ref: string): void {
  if (looksLikePlaintextKey(ref)) {
    throw new Error(`${PLAINTEXT_KEY_REJECT_MSG}（收到：${ref.slice(0, 4)}…）`);
  }
}
