'use client';
// M5-AUTH-RLS F002（spec D-10 §2.1-2.4）— 登录页，port 自 Horizon UI Pro 模板。
//
// 【port 实源】db4rDjuaSCqaEFW9XcFo_horizon-tailwind-react-nextjs-pro-3.0.0/
//   horizon-tailwind-react-nextjs-pro-main/src/app/auth/sign-in/default/page.tsx
//   依赖件（三件均为仓内既有模板库存，见 docs/dev/template-inventory.md B/C 组，本批接线）：
//   components/auth/variants/DefaultAuthLayout · components/fields/InputField · components/checkbox
//
// 【fork 留痕（template-port-guide.md §2.4）】
//  1. **删**「Sign In with Google」钮及其下的 or 分隔线 —— spec §2.3 明写「不得新增第三方登录
//     按钮（本批无 OAuth）」，port 一个点了没反应的钮是假功能。卡片布局/品牌区/输入态样式全部原样保留。
//  2. 英文 demo 文案 → 业务中文（port-guide 适配清单允许：保持元素语义，不替换区块）。
//  3. 静态输入框 → 受控表单 + 真 signIn('credentials')；错误态用 data-testid="login-error" 渲染。
//  4. 「Forgot Password?」本批无找回流程（spec §3 未列），元素与样式保留、目标置 '#'
//     （模板原件亦为占位 href=" "）——待流程就位后重指，已在 commit 正文登记。
//  5. 「Keep me logged In」保留为受控开关；会话有效期本批固定 7 天（lib/auth/config
//     SESSION_MAX_AGE_SEC），故该开关暂不改变有效期，行为接线同样登记。

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import InputField from 'components/fields/InputField';
import Default from 'components/auth/variants/DefaultAuthLayout';
import Checkbox from 'components/checkbox';
import {
  loginErrorMessage,
  validateLoginForm,
} from 'lib/auth/form-messages';

/** 登录成功后的落点：优先回到被 middleware（F003）拦下的原地址。 */
const DEFAULT_AFTER_LOGIN = '/admin/today';

/**
 * 取 callbackUrl 并防开放重定向：只接受站内相对路径。
 * 刻意读 window.location 而不用 useSearchParams —— 后者会把整页拖进
 * 「必须裹 Suspense 否则 next build 报错」的预渲染约束，而这里只在提交那一刻需要它。
 */
function safeCallbackUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_AFTER_LOGIN;
  const raw = new URLSearchParams(window.location.search).get('callbackUrl');
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return DEFAULT_AFTER_LOGIN;
}

function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keepLoggedIn, setKeepLoggedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const invalid = validateLoginForm({ email, password });
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // redirect:false —— 自行处理错误态，避免整页跳转丢掉用户已填内容
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });
      if (!result || result.error) {
        setError(loginErrorMessage(result ?? null));
        return;
      }
      router.push(safeCallbackUrl());
      router.refresh();
    } catch {
      setError(loginErrorMessage(null));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Default
      maincard={
        <div className="mb-16 mt-16 flex h-full w-full items-center justify-center px-2 md:mx-0 md:px-0 lg:mb-10 lg:items-center lg:justify-start">
          {/* Sign in section */}
          <div className="mt-[10vh] w-full max-w-full flex-col items-center md:pl-4 lg:pl-0 xl:max-w-[420px]">
            <h3 className="mb-2.5 text-4xl font-bold text-navy-700 dark:text-white">
              登录
            </h3>
            <p className="mb-9 ml-1 text-base text-gray-600">
              输入邮箱与密码登录 KOLMatrix
            </p>
            <form onSubmit={handleSubmit} noValidate data-testid="login-form">
              {/* Email */}
              <InputField
                variant="auth"
                extra="mb-3"
                label="邮箱*"
                placeholder="you@example.com"
                id="email"
                type="text"
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
                placeholder="至少 10 位"
                id="password"
                type="password"
                value={password}
                onChange={(e: { target: { value: string } }) =>
                  setPassword(e.target.value)
                }
              />
              {/* Checkbox */}
              <div className="mb-4 flex items-center justify-between px-2">
                <div className="mt-2 flex items-center">
                  <Checkbox
                    id="keep-logged-in"
                    checked={keepLoggedIn}
                    onChange={() => setKeepLoggedIn((v) => !v)}
                  />
                  <label
                    htmlFor="keep-logged-in"
                    className="ml-2 text-sm font-medium text-navy-700 hover:cursor-pointer dark:text-white"
                  >
                    保持登录状态
                  </label>
                </div>
                <a
                  className="text-sm font-medium text-brand-500 hover:text-brand-600 dark:text-white"
                  href="#"
                >
                  忘记密码？
                </a>
              </div>
              {error ? (
                <p
                  data-testid="login-error"
                  role="alert"
                  className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-500 dark:bg-navy-800 dark:text-red-400"
                >
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={submitting}
                className="linear w-full rounded-xl bg-brand-500 py-3 text-base font-medium text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-brand-400 dark:text-white dark:hover:bg-brand-300 dark:active:bg-brand-200"
              >
                {submitting ? '登录中…' : '登录'}
              </button>
            </form>
            <div className="mt-4">
              <span className="text-sm font-medium text-navy-700 dark:text-gray-500">
                还没有账号？
              </span>
              <a
                href="/signup"
                className="ml-1 text-sm font-medium text-brand-500 hover:text-brand-600 dark:text-white"
              >
                创建账号
              </a>
            </div>
          </div>
        </div>
      }
    />
  );
}

export default LoginPage;
