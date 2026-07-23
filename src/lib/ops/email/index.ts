// M3-A-REACH-CRM F003 — EmailSender env 选择器（三分支，P4 fail-fast 语义保留）
//
// ① RESEND_API_KEY 在场（非 placeholder）→ ResendEmailSender 真投递
// ② 无 key / placeholder + 非 production → MockEmailSender（CI 与本地默认，不外呼）
// ③ 无 key / placeholder + production → 抛错拒发（旧 BIx P1-9 沉淀：真实触达绝不静默
//    消失在一条 mock 日志里——prod 缺配置必须炸在发送时刻，不得静默降级）

import { MockEmailSender } from './mock-sender';
import { ResendEmailSender } from './resend-sender';
import { SendEmailError, type EmailSender } from './types';

/** 常见占位值视同无 key（旧项目同款防呆）。 */
const PLACEHOLDER_KEY = /^(placeholder|test|mock|re_placeholder)/i;

export function getEmailSender(): EmailSender {
  const key = process.env.RESEND_API_KEY;
  const effectivelyMissing = !key || PLACEHOLDER_KEY.test(key);
  if (effectivelyMissing) {
    if (process.env.NODE_ENV === 'production') {
      throw new SendEmailError(
        'provider_error',
        'RESEND_API_KEY 缺失（或为占位值）——生产环境拒发，不静默 mock（P4 fail-fast）',
      );
    }
    return new MockEmailSender();
  }
  return new ResendEmailSender(key);
}

export { SENT_MARKER, MockEmailSender } from './mock-sender';
export { ResendEmailSender, FROM_ADDRESS } from './resend-sender';
export * from './types';
