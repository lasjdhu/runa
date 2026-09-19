import { Text, type TextProps } from "@expo/ui";
import type { ReactNode } from "react";

import { useAppColors } from "@/lib/config/colors";
import { fonts } from "@/lib/config/constants";

type TextVariant = "display" | "title" | "body" | "caption" | "label";
type TextTone = "default" | "muted" | "subtle" | "accent";

type AppTextProps = Omit<TextProps, "children" | "textStyle"> & {
  children?: ReactNode;
  variant?: TextVariant;
  tone?: TextTone;
  textStyle?: TextProps["textStyle"];
};

export function AppText({
  children,
  variant = "body",
  tone = "default",
  textStyle,
  ...props
}: AppTextProps) {
  const colors = useAppColors();

  return (
    <Text
      {...props}
      textStyle={{
        ...variantStyles[variant],
        color: colors[toneColorKeys[tone]],
        ...textStyle,
      }}
    >
      {children == null ? "" : String(children)}
    </Text>
  );
}

const variantStyles: Record<
  TextVariant,
  NonNullable<TextProps["textStyle"]>
> = {
  display: {
    fontFamily: fonts.bold,
    fontSize: 34,
    lineHeight: 40,
  },
  title: {
    fontFamily: fonts.semiBold,
    fontSize: 20,
    lineHeight: 26,
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 18,
  },
};

const toneColorKeys: Record<
  TextTone,
  "text" | "textMuted" | "textSubtle" | "accent"
> = {
  default: "text",
  muted: "textMuted",
  subtle: "textSubtle",
  accent: "accent",
};
