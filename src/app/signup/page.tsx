'use client';
// M5-AUTH-RLS F002（spec D-10 §2.1-2.4）— 注册页，port 自 Horizon UI Pro 模板。
//
// 【port 实源】db4rDjuaSCqaEFW9XcFo_horizon-tailwind-react-nextjs-pro-3.0.0/
//   horizon-tailwind-react-nextjs-pro-main/src/app/auth/sign-up/default/page.tsx
//   依赖件同登录页（DefaultAuthLayout / InputField / Checkbox，仓内既有模板库存，本批接线）。
//
// 【fork 留痕（template-port-guide.md §2.4）】
//  1. **删**「Sign Up with Google」钮及 or 分隔线 —— spec §2.3「不得新增第三方登录按钮」。
//  2. 模板的 First Name / Last Name 两列 → 「团队名称」/「你的称呼」两列：**两列结构原样保留**，
//     字段语义按 D-4 落到真实数据（Tenant.name / User.name），不是自创区块。
//  3. 条款勾选保留（模板即纯文本无链接），本批要求勾选后才可提交。
//  4. 英文 demo 文案 → 业务中文；静态输入框 → 受控表单。
//
// 【F005 接管点】本 feature 只做页面与表单壳：提交打 POST /api/auth/register（D-4 注册端点，
// 由 **F005** 实装事务建 Tenant+User）。端点未实装前该请求 404 → 渲染
// AUTH_FORM_MESSAGES.registerUnavailable。F005 落地后本文件无需改动即联通；
// 服务端才是校验权威（zod 口令强度 / email 唯一 / 限速），这里的校验只省一次注定失败的往返。

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import InputField from 'components/fields/InputField';
import Default from 'components/auth/variants/DefaultAuthLayout';
import Checkbox from 'components/checkbox';
import {
  AUTH_FORM_MESSAGES,
  registerErrorMessage,
  validateSignupForm,
} from 'lib/auth/form-messages';

/** F005 接管的注册端点。静态段优先级高于 /api/auth/[...nextauth] catch-all，不会被吞。 */
const REGISTER_ENDPOINT = '/api/auth/register';
const AFTER_SIGNUP = '/admin/today';

function SignupPage() {
  const router = useRouter();
  const [tenantName, setTenantName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const invalid = validateSignupForm({ tenantName, email, password });
    if (invalid) {
      setError(invalid);
      return;
    }
    if (!agreed) {
      setError(AUTH_FORM_MESSAGES.missingTerms);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(REGISTER_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantName, name, email, password }),
      });
      if (!res.ok) {
        type RegisterErrorPayload = { error?: string; message?: string };
        const payload = (await res
          .json()
          .catch((): RegisterErrorPayload | null => null)) as
          | RegisterErrorPayload
          | null;
        setError(
          registerErrorMessage(res.status, payload?.message ?? payload?.error),
        );
        return;
      }
      // 注册成功即登录（D-4）。端点由 F005 实装；此处按同一凭据换会话。
      const signedIn = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });
      if (!signedIn || signedIn.error) {
        // 账号已建但会话没换成：把用户送去登录页自行登录，不谎报失败
        router.push('/login');
        return;
      }
      router.push(AFTER_SIGNUP);
      router.refresh();
    } catch {
      setError(AUTH_FORM_MESSAGES.registerFailed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Default
      maincard={
        <div className="mb-16 flex h-full w-full items-center justify-center px-2 md:mx-0 md:px-0 lg:mb-10 lg:items-start lg:justify-start">
          {/* Sign up section */}
          <div className="mt-[10vh] w-full max-w-full flex-col md:pl-4 lg:pl-0 xl:max-w-[420px]">
            <h3 className="text-4xl font-bold text-navy-700 dark:text-white">
              创建账号
            </h3>
            <p className="ml-1 mt-[10px] text-base text-gray-600">
              注册即创建你自己的团队空间
            </p>
            <form
              onSubmit={handleSubmit}
              noValidate
              data-testid="signup-form"
              className="mt-9"
            >
              {/* user info */}
              <div className="mb-3 flex w-full items-center justify-center gap-4">
                <div className="w-1/2">
                  <InputField
                    variant="auth"
                    extra="mb-3"
                    label="团队名称*"
                    placeholder="星轨工作室"
                    id="tenantName"
                    type="text"
                    value={tenantName}
                    onChange={(e: { target: { value: string } }) =>
                      setTenantName(e.target.value)
                    }
                  />
                </div>

                <div className="w-1/2">
                  <InputField
                    variant="auth"
                    extra="mb-3"
                    label="你的称呼"
                    placeholder="李明"
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e: { target: { value: string } }) =>
                      setName(e.target.value)
                    }
                  />
                </div>
              </div>
              {/* Email */}
              <InputField
                variant="auth"
                extra="mb-3"
                label="邮箱*"
                placeholder="you@example.com"
                id="email"
                type="email"
                value={email}
                onChange={(e: { target: { value: string } }) =>
                  setEmail(e.target.value)
                }
              />
              {/* Password */}
              <InputField
                variant="auth"
                extra="mb-3"
                label="密码*"
                placeholder="至少 10 位，含字母和数字"
                id="password"
                type="password"
                value={password}
                onChange={(e: { target: { value: string } }) =>
                  setPassword(e.target.value)
                }
              />
              {/* Checkbox */}
              <div className="mt-4 flex items-center justify-between px-2">
                <div className="flex">
                  <Checkbox
                    id="agree-terms"
                    checked={agreed}
                    onChange={() => setAgreed((v) => !v)}
                  />
                  <label
                    htmlFor="agree-terms"
                    className="ml-2 text-sm text-navy-700 hover:cursor-pointer dark:text-white"
                  >
                    创建账号即表示你同意服务条款与隐私政策
                  </label>
                </div>
              </div>

              {error ? (
                <p
                  data-testid="signup-error"
                  role="alert"
                  className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-500 dark:bg-navy-800 dark:text-red-400"
                >
                  {error}
                </p>
              ) : null}

              {/* button */}
              <button
                type="submit"
                disabled={submitting}
                className="linear mt-4 w-full rounded-xl bg-brand-500 py-3 text-base font-medium text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-brand-400 dark:text-white dark:hover:bg-brand-300 dark:active:bg-brand-200"
              >
                {submitting ? '创建中…' : '创建我的账号'}
              </button>
            </form>

            <div className="mt-3">
              <span className="text-sm font-medium text-navy-700 dark:text-gray-500">
                已经有账号？
              </span>
              <a
                href="/login"
                className="ml-1 text-sm font-medium text-brand-500 hover:text-brand-600 dark:text-white"
              >
                去登录
              </a>
            </div>
          </div>
        </div>
      }
    />
  );
}

export default SignupPage;
