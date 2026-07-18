import type { CSSProperties, ReactElement } from "react";
import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  className?: string;
}

export function Skeleton({
  width = "100%",
  height = "1rem",
  className,
}: SkeletonProps): ReactElement {
  const style: CSSProperties = { width, height };
  return (
    <span
      className={[styles.skeleton, className].filter(Boolean).join(" ")}
      style={style}
      role="presentation"
      aria-hidden="true"
    />
  );
}
