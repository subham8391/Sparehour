// The web app's icon set on the phone: the same drawings (../../../src/ui/icon-paths.ts), a 20-unit grid with a 1.6
// stroke, round caps and joins (DESIGN_SYSTEM.md §6).
import Svg, { Path } from "react-native-svg";
import { ICON_PATHS, type IconName } from "@/ui/icon-paths";

export type { IconName } from "@/ui/icon-paths";

export function Icon({ name, size = 20, color, strokeWidth = 1.6 }: { name: IconName; size?: number; color: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <Path d={ICON_PATHS[name]} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
