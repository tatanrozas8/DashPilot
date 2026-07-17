"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, UIEvent } from "react";
import type { DataRow } from "@/types/dataset";
import { cn } from "@/lib/utils";

export interface VirtualizedDataTableColumn {
  key: string;
  label: string;
  width?: number;
}

export interface VirtualizedDataTableProps {
  rows: DataRow[];
  columns: VirtualizedDataTableColumn[];
  totalRows: number;
  height?: number;
  rowHeight?: number;
  columnWidth?: number;
  overscanRows?: number;
  overscanColumns?: number;
  emptyMessage: string;
  ariaLabel: string;
  className?: string;
  onRowSelect?: (row: DataRow, index: number) => void;
  onColumnHeaderClick?: (column: string) => void;
}

const DEFAULT_HEIGHT = 420;
const DEFAULT_ROW_HEIGHT = 40;
const DEFAULT_COLUMN_WIDTH = 176;
const HEADER_HEIGHT = 42;

function scheduleFrame(callback: () => void) {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(callback);
  return window.setTimeout(callback, 16);
}

function cancelFrame(id: number) {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(id);
    return;
  }
  window.clearTimeout(id);
}

function visibleRange(offset: number, viewportSize: number, itemSize: number, total: number, overscan: number) {
  const visibleCount = Math.max(1, Math.ceil(viewportSize / itemSize));
  const start = Math.max(0, Math.floor(offset / itemSize) - overscan);
  const end = Math.min(total, start + visibleCount + overscan * 2 + 1);
  return { start, end };
}

function cellValue(row: DataRow, column: string) {
  const value = row[column];
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

const VirtualizedCell = memo(function VirtualizedCell({
  row,
  column,
  style
}: {
  row: DataRow;
  column: VirtualizedDataTableColumn;
  style: CSSProperties;
}) {
  return (
    <div
      role="cell"
      data-virtual-cell="true"
      className="truncate border-b border-[#edf1fa] px-3 py-2 text-sm text-[#1c2748]"
      style={style}
      title={cellValue(row, column.key)}
    >
      {cellValue(row, column.key)}
    </div>
  );
});

export function VirtualizedDataTable({
  rows,
  columns,
  totalRows,
  height = DEFAULT_HEIGHT,
  rowHeight = DEFAULT_ROW_HEIGHT,
  columnWidth = DEFAULT_COLUMN_WIDTH,
  overscanRows = 6,
  overscanColumns = 2,
  emptyMessage,
  ariaLabel,
  className,
  onRowSelect,
  onColumnHeaderClick
}: VirtualizedDataTableProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportSize, setViewportSize] = useState({ width: 960, height });
  const effectiveColumns = useMemo(
    () => columns.map((column) => ({ ...column, width: column.width ?? columnWidth })),
    [columnWidth, columns]
  );
  const totalColumnWidth = effectiveColumns.reduce((sum, column) => sum + column.width, 0);
  const rowRange = visibleRange(scrollTop, Math.max(rowHeight, viewportSize.height - HEADER_HEIGHT), rowHeight, rows.length, overscanRows);
  const averageColumnWidth = effectiveColumns.length ? totalColumnWidth / effectiveColumns.length : columnWidth;
  const columnRange = visibleRange(scrollLeft, Math.max(averageColumnWidth, viewportSize.width), averageColumnWidth, effectiveColumns.length, overscanColumns);
  const columnOffsets = useMemo(() => {
    return effectiveColumns.map((_, index) => effectiveColumns.slice(0, index).reduce((sum, column) => sum + column.width, 0));
  }, [effectiveColumns]);
  const visibleRows = rows.slice(rowRange.start, rowRange.end);
  const visibleColumns = effectiveColumns.slice(columnRange.start, columnRange.end);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const resize = () => setViewportSize({ width: element.clientWidth || 960, height: element.clientHeight || height });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [height]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelFrame(frameRef.current);
  }, []);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const nextTop = target.scrollTop;
    const nextLeft = target.scrollLeft;
    if (frameRef.current !== null) cancelFrame(frameRef.current);
    frameRef.current = scheduleFrame(() => {
      setScrollTop(nextTop);
      setScrollLeft(nextLeft);
      frameRef.current = null;
    });
  }

  if (!columns.length) {
    return (
      <div className={cn("grid place-items-center rounded-xl border border-dashed border-[#d8def2] bg-[#fbfcff] p-8 text-center text-sm font-semibold text-[#697597]", className)}>
        No hay columnas para mostrar.
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className={cn("grid place-items-center rounded-xl border border-dashed border-[#d8def2] bg-[#fbfcff] p-8 text-center text-sm font-semibold text-[#697597]", className)}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={viewportRef}
      role="table"
      aria-label={ariaLabel}
      aria-rowcount={totalRows}
      aria-colcount={columns.length}
      className={cn("relative overflow-auto rounded-xl border border-[#edf1fa] bg-white", className)}
      style={{ height }}
      onScroll={handleScroll}
      data-virtual-row-count={visibleRows.length}
      data-virtual-column-count={visibleColumns.length}
    >
      <div style={{ width: totalColumnWidth, height: HEADER_HEIGHT + rows.length * rowHeight, position: "relative" }}>
        <div role="row" className="sticky top-0 z-10 bg-[#fbfcff] text-xs font-bold text-[#536088]" style={{ height: HEADER_HEIGHT }}>
          {visibleColumns.map((column, offset) => {
            const columnIndex = columnRange.start + offset;
            return (
              <button
                type="button"
                key={column.key}
                role="columnheader"
                className={cn("absolute truncate border-b border-[#edf1fa] px-3 py-3 text-left font-bold", onColumnHeaderClick ? "hover:bg-[#f4f6ff]" : "cursor-default")}
                style={{ left: columnOffsets[columnIndex], top: 0, width: column.width, height: HEADER_HEIGHT }}
                title={column.label}
                onClick={() => onColumnHeaderClick?.(column.key)}
              >
                {column.label}
              </button>
            );
          })}
        </div>
        {visibleRows.map((row, offset) => {
          const rowIndex = rowRange.start + offset;
          return (
            <div
              key={rowIndex}
              role="row"
              aria-rowindex={rowIndex + 1}
              className={cn("absolute block text-left hover:bg-[#fbfcff]", onRowSelect ? "cursor-pointer" : "cursor-default")}
              style={{ top: HEADER_HEIGHT + rowIndex * rowHeight, left: 0, width: totalColumnWidth, height: rowHeight }}
              onClick={() => onRowSelect?.(row, rowIndex)}
              onKeyDown={(event) => {
                if (!onRowSelect || (event.key !== "Enter" && event.key !== " ")) return;
                event.preventDefault();
                onRowSelect(row, rowIndex);
              }}
              tabIndex={onRowSelect ? 0 : undefined}
            >
              {visibleColumns.map((column, columnOffset) => {
                const columnIndex = columnRange.start + columnOffset;
                return (
                  <VirtualizedCell
                    key={column.key}
                    row={row}
                    column={column}
                    style={{ position: "absolute", left: columnOffsets[columnIndex], top: 0, width: column.width, height: rowHeight }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
