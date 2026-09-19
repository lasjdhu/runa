import { Column, type UniversalStyle } from "@expo/ui";
import type { PropsWithChildren } from "react";

import { useAppColors } from "@/lib/config/colors";

type SurfaceProps = PropsWithChildren<{
  raised?: boolean;
  style?: UniversalStyle;
}>;

export function Surface({
  children,
  raised = false,
  style,
  ...props
}: SurfaceProps) {
  const colors = useAppColors();

  return (
    <Column
      {...props}
      style={{
        backgroundColor: raised ? colors.surfaceRaised : colors.surface,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        ...style,
      }}
    >
      {children}
    </Column>
  );
}
