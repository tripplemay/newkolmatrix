# M4.5-AGENT-LOOP verify-G5（Evaluator 产物，非产品代码）——视觉失败的机械成因判据
#
# 不靠肉眼看 diff 图下结论：逐像素比对 actual vs expected，输出**差异像素的包围盒**，
# 并与 CopilotPanel 右栏的几何位置（桌面视口 1512 宽 × 右栏 360px → x ∈ [1152, 1512)）比对。
# 全部差异落在右栏内 = 与「面板聚合卡的数据依赖」一致；有差异落在右栏外 = 另有成因，需单独定性。
#
# 用法：python3 scripts/test/m45-g5-diff-bbox.py <test-results 目录>

import sys, os, glob
from PIL import Image
import numpy as np

PANEL_W = 360  # CopilotPanel 常驻右栏宽（CopilotPanel.tsx: w-[360px]）

def analyze(actual_path, expected_path):
    a = np.array(Image.open(actual_path).convert('RGB')).astype(np.int16)
    e = np.array(Image.open(expected_path).convert('RGB')).astype(np.int16)
    if a.shape != e.shape:
        return dict(size_mismatch=True, actual=a.shape, expected=e.shape)
    diff = (np.abs(a - e).max(axis=2) > 8)
    n = int(diff.sum())
    if n == 0:
        return dict(diff_pixels=0)
    ys, xs = np.nonzero(diff)
    h, w = diff.shape
    panel_x0 = w - PANEL_W
    outside = int((xs < panel_x0).sum())
    return dict(
        size=(w, h),
        diff_pixels=n,
        bbox=(int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())),
        panel_x0=panel_x0,
        pixels_left_of_panel=outside,
    )

def main():
    root = sys.argv[1] if len(sys.argv) > 1 else 'test-results'
    for d in sorted(os.listdir(root)):
        p = os.path.join(root, d)
        if not os.path.isdir(p):
            continue
        acts = glob.glob(os.path.join(p, '*-actual.png'))
        if not acts:
            print(f'{d}: (无 actual.png —— 非截图失败，见日志)')
            continue
        act = acts[0]
        exp = act.replace('-actual.png', '-expected.png')
        if not os.path.exists(exp):
            print(f'{d}: 缺 expected')
            continue
        r = analyze(act, exp)
        print(f'{d}: {r}')

main()
