"use client";

import { forwardRef, type CSSProperties, type ReactNode } from "react";

type Props = {
  children?: ReactNode;
  className?: string;
  /** 시각적 높이(px) */
  height: number;
  style?: CSSProperties;
};

/**
 * 부모 CSS zoom이 있으면 lightweight-charts 십자선이 마우스와 어긋남.
 * TradeJournal의 --page-zoom을 역보정한다.
 */
export const ZoomSafeChartBox = forwardRef<HTMLDivElement, Props>(
  function ZoomSafeChartBox({ children, className, height, style }, ref) {
    return (
      <div
        ref={ref}
        className={className}
        style={{
          width: "calc(100% * var(--page-zoom, 1))",
          height: `calc(${height}px * var(--page-zoom, 1))`,
          ...({ zoom: "calc(1 / var(--page-zoom, 1))" } as CSSProperties),
          ...style,
        }}
      >
        {children}
      </div>
    );
  }
);
