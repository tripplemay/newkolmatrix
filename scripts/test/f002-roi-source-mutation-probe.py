# M4-INSIGHT F002 验收探针（Evaluator 产物，非产品代码）——源码级变异测试。
#
# 与 tests/unit/roi-compute.test.ts 内的 D20 变异体（包装器变异）互补：本探针直接改
# src/lib/domain/roi-compute.ts 的**真实源码**，验证同一组单测是否翻红（检测器活性证明）。
# 产品代码零改动：变异在 `git worktree` 隔离副本中进行，跑完还原。
#
# 用法：
#   git worktree add --detach /tmp/f002-mut HEAD && ln -s "$PWD/node_modules" /tmp/f002-mut/node_modules
#   python3 scripts/test/f002-roi-source-mutation-probe.py
#   git worktree remove --force /tmp/f002-mut
#
# 2026-07-24 实测：9/9 变异体全部 KILLED（SURVIVED=0）。
import subprocess, sys, pathlib
SRC = pathlib.Path('/tmp/f002-mut/src/lib/domain/roi-compute.ts')
ORIG = subprocess.run(['git','-C','/tmp/f002-mut','show','HEAD:src/lib/domain/roi-compute.ts'],
                      capture_output=True, text=True).stdout

MUTANTS = {
 'M1 spend ?? 0 (未知花费坍缩成零)':
   ("const spend = normCount(input.spend);", "const spend = normCount(input.spend) ?? 0;"),
 'M2 分子缺 -> roi=0 + computed (缺证据填零)':
   ("return { roi: null, basis: 'insufficient_evidence', spend, exposure };",
    "return { roi: 0, basis: 'computed', spend, exposure };"),
 'M3 分子缺 -> 猜正数 roi=1.2':
   ("return { roi: null, basis: 'insufficient_evidence', spend, exposure };",
    "return { roi: 1.2, basis: 'computed', spend, exposure };"),
 'M4 达成方向恒 up':
   ("delta === 0 ? 'flat' : delta > 0 === higherIsBetter ? 'up' : 'down';", "'up';"),
 'M5 三值压二态 (flat 并入 up)':
   ("delta === 0 ? 'flat' : delta > 0 === higherIsBetter ? 'up' : 'down';",
    "delta >= 0 === higherIsBetter ? 'up' : 'down';"),
 'M6 缺数据默认 flat (编造持平)':
   ("return { target: t, actual: a, delta: null, deltaRatio: null, direction: null };",
    "return { target: t, actual: a, delta: null, deltaRatio: null, direction: 'flat' };"),
 'M7 极性被忽略 (higherIsBetter 恒 true)':
   ("const higherIsBetter = options.higherIsBetter ?? true;", "const higherIsBetter = true;"),
 'M8 spend=0 与 spend=null 合流 (zero_spend 消失)':
   ("return { roi: null, basis: 'zero_spend', spend: 0, exposure };",
    "return { roi: null, basis: 'insufficient_evidence', spend: 0, exposure };"),
 'M9 非法值(负数/NaN)被放行 (normCount 去掉合法性校验)':
   ("return typeof value === 'number' && Number.isFinite(value) && value >= 0\n    ? value\n    : null;",
    "return typeof value === 'number' ? value : null;"),
}
results = []
for name,(old,new) in MUTANTS.items():
    if old not in ORIG:
        results.append((name,'PATCH-MISS','变异锚点未命中')); continue
    SRC.write_text(ORIG.replace(old,new,1))
    p = subprocess.run(['npx','vitest','run','tests/unit/roi-compute.test.ts'],
                       cwd='/tmp/f002-mut', capture_output=True, text=True)
    out = p.stdout + p.stderr
    killed = p.returncode != 0
    line = [l.strip() for l in out.splitlines() if 'Tests ' in l and ('failed' in l or 'passed' in l)]
    results.append((name,'KILLED(翻红)' if killed else 'SURVIVED(未被检出)', line[-1] if line else out[-200:]))
SRC.write_text(ORIG)
print(f"{'变异体':<50} {'结果':<18} 测试统计")
for n,s,d in results: print(f"{n:<50} {s:<18} {d}")
print("\nSURVIVED count =", sum(1 for _,s,_ in results if s.startswith('SURVIVED')))
print("PATCH-MISS count =", sum(1 for _,s,_ in results if s=='PATCH-MISS'))
