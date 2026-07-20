#!/usr/bin/env bash
# FE-AUDIT F002 — 公共组件抽取完备性：重复 UI 模式扫描器
#
# 署名：Andy/evaluator-subagent
# 用途：在 KOLMatrix 自建前端面（15 个 page.tsx + common/ copilot/ project/）中，
#       按 Tailwind class 指纹定位出现 >=2 次的重复 UI 模式，输出 文件:行 级证据。
#
# 用法：
#   bash scripts/test/fe-audit-dup-scan.sh            # 全量扫描
#   bash scripts/test/fe-audit-dup-scan.sh P2         # 只跑某个模式
#
# 口径说明：
#   - 扫描范围 = F002 spec 界定的「自建面」，**不含**模板继承组件
#     （card/ navbar/ sidebar/ rtl/ fields/ 等归 F001 模板对照审计）。
#   - 指纹取「结构性 class 组合」，非全串匹配 —— 允许尺寸/间距微调仍判为同一模式。
#   - 输出的每一行都是可直接复核的 文件:行:内容。

set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

# F002 审计范围（自建面）
SCOPE=(
  src/app/admin
  src/app/preview
  src/app/page.tsx
  src/components/common
  src/components/copilot
  src/components/project
)

scan() {
  local id="$1"; local name="$2"; shift 2
  local args=()
  for pat in "$@"; do args+=(-e "$pat"); done
  echo "=============================================================="
  echo "[$id] $name"
  echo "  指纹: $*"
  echo "--------------------------------------------------------------"
  local out
  out=$(grep -rn --include='*.tsx' "${args[@]}" "${SCOPE[@]}" 2>/dev/null)
  if [ -z "$out" ]; then
    echo "  (无命中)"
  else
    echo "$out" | sed 's/^/  /'
    echo "--------------------------------------------------------------"
    echo "  命中数: $(echo "$out" | wc -l | tr -d ' ')  |  涉及文件数: $(echo "$out" | cut -d: -f1 | sort -u | wc -l | tr -d ' ')"
  fi
  echo
}

ONLY="${1:-}"
run() { [ -z "$ONLY" ] || [ "$ONLY" = "$1" ] && scan "$@"; }

run P1 "brand 药丸徽标 Badge/Pill"            'bg-brand-50'
run P2 "对话气泡 ChatBubble"                   'rounded-br-md' 'rounded-bl-md'
run P3 "标签-值 定义行 DefinitionRow"          'shrink-0 font-semibold text-gray-400'
run P4 "卡片区块小标题 SectionLabel(icon+text)" 'flex items-center gap-1.5 text-xs font-semibold text-gray-500' \
                                               'flex items-center gap-1.5 text-sm font-semibold text-gray-500'
run P5 "页面头 PageHeader(h1+副标题)"          'text-2xl font-bold text-navy-700'
run P6 "交接卡 HandoffCard 外框"               'rounded-xl border border-gray-200 bg-white'
run P7 "空态/占位 EmptyState(虚线框)"          'border-dashed'
run P8 "灰色小标签 TagChip"                    'bg-gray-100 px-1.5 py-0.5' 'bg-gray-100 px-2 py-0.5'
run P9 "可点卡片行 ClickableRow(hover 抬升)"   'transition hover:shadow' 'transition hover:border'
run P10 "loading/思考态文本"                   'text-gray-400">$' 'italic text-gray-400' '加载' '正在思考'

echo "=============================================================="
echo "扫描完成。复核方式：直接打开输出中的 文件:行 即可。"
