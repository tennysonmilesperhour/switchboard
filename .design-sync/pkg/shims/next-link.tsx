import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from 'react';

/*
 * Stand-in for `next/link`, used only inside the design-sync bundle.
 *
 * The real Link needs the Next.js router. Claude Design renders the components
 * outside Next, so the bundle resolves `next/link` here instead (see
 * ../tsconfig.paths.json). It renders a plain anchor and drops the props that
 * only mean something to the Next router. The app itself never loads this file.
 */

type Href = string | { pathname?: string | null };

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: Href;
  prefetch?: boolean | null;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  legacyBehavior?: boolean;
  locale?: string | false;
  children?: ReactNode;
}

const NEXT_ONLY_PROPS = [
  'prefetch',
  'replace',
  'scroll',
  'shallow',
  'passHref',
  'legacyBehavior',
  'locale',
] as const;

function hrefString(href: Href): string {
  if (typeof href === 'string') return href;
  return href.pathname ?? '#';
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(props, ref) {
  const anchorProps: Record<string, unknown> = { ...props };
  for (const key of NEXT_ONLY_PROPS) delete anchorProps[key];
  delete anchorProps.href;
  return (
    <a ref={ref} href={hrefString(props.href)} {...anchorProps}>
      {props.children}
    </a>
  );
});

export default Link;
