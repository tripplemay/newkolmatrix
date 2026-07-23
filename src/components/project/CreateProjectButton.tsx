'use client';
// M2-C-AGENT-HONESTY F002 — 项目列表「新建项目」入口（U1/P4 布局变更，
// 原型 + ui-inventory V2 已同批登记）。
//
// 轻量弹层表单（名称必填 + 游戏下拉可空 + 市场可空）→ POST /api/projects
//（与 create_project 工具同服务单一真相源）→ 成功 toast + 跳项目详情（brief 环节起点）。
// 自建 fixed 遮罩弹层（不引 Chakra Modal——无 ChakraProvider 的 $token 解析坑，
// CreatorDrawer P2-CLEANUP F001 前车之鉴；表单仅三字段，自建成本更低）。

import React from 'react';
import { useRouter } from 'next/navigation';
import { MdAdd, MdClose } from 'react-icons/md';
import Button from 'components/common/Button';
import { useToast } from 'components/common/Toast';

export interface GameOption {
  id: string;
  name: string;
}

export default function CreateProjectButton({ games }: { games: GameOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [gameId, setGameId] = React.useState('');
  const [market, setMarket] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast('请填写项目名');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          ...(gameId ? { gameIdOrSlug: gameId } : {}),
          ...(market.trim() ? { market: market.trim() } : {}),
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        project?: { id: string };
      };
      if (!res.ok || !body.project) {
        toast(body.error ?? '创建失败，请重试');
        return;
      }
      toast(`项目「${name.trim()}」已创建——先在「目标 Brief」设定目标`);
      setOpen(false);
      router.push(`/admin/campaigns/${body.project.id}?env=brief`);
    } catch {
      toast('创建失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-navy-700 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-900 dark:text-white';

  return (
    <>
      <Button
        variant="solid"
        size="sm"
        leftIcon={<MdAdd size={16} aria-hidden />}
        onClick={() => setOpen(true)}
      >
        新建项目
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-[120] grid place-items-center bg-navy-900/50 p-4 backdrop-blur-[3px]"
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            role="dialog"
            aria-label="新建项目"
            className="w-full max-w-[420px] rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-navy-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <b className="text-lg font-bold text-navy-700 dark:text-white">
                新建项目
              </b>
              <button
                type="button"
                aria-label="关闭"
                className="grid h-8 w-8 place-items-center rounded-lg bg-lightPrimary text-gray-700 transition hover:text-brand-500 dark:bg-navy-700 dark:text-gray-400"
                onClick={() => setOpen(false)}
              >
                <MdClose size={16} aria-hidden />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-xs font-bold text-gray-700 dark:text-gray-400">
                项目名（必填）
                <input
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="如：王者荣耀·东南亚推广"
                  autoFocus
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-bold text-gray-700 dark:text-gray-400">
                关联游戏（可选）
                <select
                  className={inputCls}
                  value={gameId}
                  onChange={(e) => setGameId(e.target.value)}
                >
                  <option value="">暂不关联（之后可在游戏知识页补挂）</option>
                  {games.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-bold text-gray-700 dark:text-gray-400">
                目标市场（可选）
                <input
                  className={inputCls}
                  value={market}
                  onChange={(e) => setMarket(e.target.value)}
                  placeholder="如：东南亚"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2.5">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button variant="solid" size="sm" onClick={() => void submit()} disabled={submitting}>
                {submitting ? '创建中…' : '创建并进入 Brief'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
