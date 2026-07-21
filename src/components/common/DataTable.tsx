'use client';
// ARCH-M05 F005 — 通用数据表：@tanstack/react-table 轻封装（排序/筛选/分页均为可选开关）。
// 表头样式对照原型 `table.tbl th`（micro 大写 · muted · 16/18 padding），沿用模板
// admin/ComplexTable 的 Horizon 表头语言（gray-600 表头 / border-gray-200 / dark:border-white/30 /
// getToggleSortingHandler），但不整个 port 页面件。
// 服务 6 张表：Match FUZZY(F009) / Delivery 台账(F011) / Insight 对照(F012) /
// 创作者库(F013) / 洞察项目表(F015) / runs 流(F016)。
// 注意：Match `.cmatrix` 对比矩阵是独立组件，不经此表（ui-inventory V5）。

import React from 'react';
import {
  ColumnDef,
  OnChangeFn,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  MdArrowDropDown,
  MdArrowDropUp,
  MdChevronLeft,
  MdChevronRight,
} from 'react-icons/md';
import SurfaceCard from './SurfaceCard';
import Button from './Button';

/** 列级对齐声明：columnDef.meta = { align: 'right' }（原型放款金额/数值列右对齐） */
export interface DataTableColumnMeta {
  align?: 'left' | 'center' | 'right';
}

export interface DataTableProps<T> {
  data: T[];
  /** createColumnHelper<T>() 产物直接可传（TValue 逐列不同，故用 any 收口） */
  columns: ColumnDef<T, any>[];
  /** 表头点击排序（默认关） */
  sortable?: boolean;
  /** 全局筛选值（受控；传 undefined = 不启用筛选管线） */
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  /** 分页开关：传每页行数即启用（默认关 = 全量渲染） */
  pageSize?: number;
  /** 整行可点（V9 创作者库开抽屉；行内按钮请自行 stopPropagation） */
  onRowClick?: (row: T) => void;
  /** 空态文案（渲染契约 D2：数据缺失渲染占位，绝不抛错） */
  emptyText?: React.ReactNode;
  /** 追加到外层卡片（SurfaceCard 表面） */
  className?: string;
}

const ALIGN_CLASSES: Record<
  NonNullable<DataTableColumnMeta['align']>,
  string
> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

function alignClass(meta: unknown): string {
  const align = (meta as DataTableColumnMeta | undefined)?.align ?? 'left';
  return ALIGN_CLASSES[align];
}

export default function DataTable<T>({
  data,
  columns,
  sortable = false,
  globalFilter,
  onGlobalFilterChange,
  pageSize,
  onRowClick,
  emptyText = '待接入',
  className,
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const filteringEnabled = globalFilter !== undefined;
  const paginationEnabled = pageSize !== undefined && pageSize > 0;

  const handleGlobalFilterChange: OnChangeFn<string> = (updater) => {
    const next =
      typeof updater === 'function' ? updater(globalFilter ?? '') : updater;
    onGlobalFilterChange?.(next ?? '');
  };

  const table = useReactTable({
    data,
    columns,
    state: {
      ...(sortable ? { sorting } : {}),
      ...(filteringEnabled ? { globalFilter } : {}),
    },
    onSortingChange: setSorting,
    ...(filteringEnabled
      ? { onGlobalFilterChange: handleGlobalFilterChange }
      : {}),
    getCoreRowModel: getCoreRowModel(),
    ...(sortable ? { getSortedRowModel: getSortedRowModel() } : {}),
    ...(filteringEnabled ? { getFilteredRowModel: getFilteredRowModel() } : {}),
    ...(paginationEnabled
      ? {
          getPaginationRowModel: getPaginationRowModel(),
          initialState: { pagination: { pageSize } },
        }
      : {}),
  });

  const rows = table.getRowModel().rows;
  const pageCount = paginationEnabled ? table.getPageCount() : 1;

  return (
    <SurfaceCard
      className={`overflow-x-auto${className ? ` ${className}` : ''}`}
    >
      <table className="w-full border-collapse text-left">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canSort = sortable && header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    onClick={
                      canSort
                        ? header.column.getToggleSortingHandler()
                        : undefined
                    }
                    className={`whitespace-nowrap border-b border-gray-200 px-[18px] py-4 text-micro font-bold uppercase tracking-wide text-gray-600 dark:border-white/30 dark:text-white ${alignClass(
                      header.column.columnDef.meta,
                    )}${canSort ? ' cursor-pointer select-none' : ''}`}
                  >
                    <span className="inline-flex items-center">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                      {sorted === 'asc' && (
                        <MdArrowDropUp className="h-4 w-4" aria-hidden />
                      )}
                      {sorted === 'desc' && (
                        <MdArrowDropDown className="h-4 w-4" aria-hidden />
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-[18px] py-10 text-center text-sm text-gray-600 dark:text-gray-400"
              >
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                onClick={
                  onRowClick ? () => onRowClick(row.original) : undefined
                }
                className={`border-b border-gray-100 last:border-b-0 dark:border-white/10${
                  onRowClick
                    ? ' cursor-pointer transition hover:bg-lightPrimary dark:hover:bg-white/5'
                    : ''
                }`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={`px-[18px] py-[15px] text-sm text-navy-700 dark:text-white ${alignClass(
                      cell.column.columnDef.meta,
                    )}`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {paginationEnabled && pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-gray-100 px-[18px] py-3 dark:border-white/10">
          <span className="text-micro text-gray-600 dark:text-gray-400">
            第 {table.getState().pagination.pageIndex + 1} / {pageCount} 页 · 共{' '}
            {table.getPrePaginationRowModel().rows.length} 行
          </span>
          <div className="flex gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              iconOnly
              aria-label="上一页"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              <MdChevronLeft className="h-5 w-5" aria-hidden />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              iconOnly
              aria-label="下一页"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              <MdChevronRight className="h-5 w-5" aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </SurfaceCard>
  );
}
