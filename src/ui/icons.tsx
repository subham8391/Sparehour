// The icon set (DESIGN_SYSTEM.md §6): inline SVG on a 20-unit grid, 1.6 px
// stroke, round caps and joins, currentColor. No emoji anywhere in the UI.
import type { SVGProps } from "react";

import { ICON_PATHS as PATHS, type IconName } from "./icon-paths";

export type { IconName } from "./icon-paths";

export function Icon({ name, size = 18, className, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

