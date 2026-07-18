import type { ElementType, HTMLAttributes } from 'react';
import clsx from 'clsx';
import styles from './Typography.module.css';

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  level: 1 | 2 | 3 | 4;
}

export function Heading({ level, className, ...props }: HeadingProps) {
  const Tag = `h${level}` as ElementType;
  const levelClass = styles[`h${level}`];
  return <Tag className={clsx(styles.heading, levelClass, className)} {...props} />;
}

export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'success' | 'danger';
export type TextSize = 'xs' | 'sm' | 'md' | 'lg';

export interface TextProps extends HTMLAttributes<HTMLElement> {
  as?: 'p' | 'span' | 'div';
  size?: TextSize;
  tone?: TextTone;
  weight?: 'normal' | 'medium';
}

export function Text({
  as = 'p',
  size = 'md',
  tone = 'primary',
  weight = 'normal',
  className,
  ...props
}: TextProps) {
  const Tag = as as ElementType;
  return (
    <Tag
      className={clsx(
        styles.text,
        styles[`size-${size}`],
        styles[`tone-${tone}`],
        styles[`weight-${weight}`],
        className,
      )}
      {...props}
    />
  );
}
