import { KLink, type KLinkProps } from './LinkAdapter';
import styles from './LinkButton.module.css';

/**
 * A navigation with button prominence.
 *
 * The rule this exists to enforce: **anything that navigates is an anchor, always** —
 * middle-click, "copy link address" and the screen-reader link role are not optional.
 * But a card's call-to-action and a page's primary destination need more visual
 * weight than an inline link carries, and Salt's `Button` cannot become an anchor.
 * So this is `KLink` wearing button chrome built from Salt's own actionable tokens.
 *
 * The litmus for choosing between this and `Button`: "Open / View / Browse + noun"
 * navigates and belongs here; "Save / Delete / Run + noun" mutates and stays a real
 * `Button`.
 */
export function LinkButton({
  appearance = 'bordered',
  className: _ignored,
  ...rest
}: KLinkProps & { appearance?: 'bordered' | 'solid' }) {
  return (
    <KLink
      {...rest}
      underline="never"
      color="inherit"
      className={`${styles.root} ${appearance === 'solid' ? styles.solid : styles.bordered}`}
    />
  );
}
