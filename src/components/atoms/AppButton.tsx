import { Button, Icon, Row, Text } from "@expo/ui";
import type { ComponentProps } from "react";

import { useAppColors } from "@/lib/config/colors";
import { fonts } from "@/lib/config/constants";

type ExpoButtonProps = ComponentProps<typeof Button>;

type AppButtonProps = Pick<ExpoButtonProps, "onPress" | "disabled"> & {
  label: string;
  icon?: ComponentProps<typeof Icon>["name"];
  variant?: ExpoButtonProps["variant"];
};

export function AppButton({
  label,
  icon,
  variant = "filled",
  onPress,
  disabled,
}: AppButtonProps) {
  const colors = useAppColors();
  const contentColor = variant === "filled" ? colors.background : colors.accent;

  return (
    <Button
      disabled={disabled}
      onPress={onPress}
      style={{
        borderColor: colors.border,
        borderRadius: 8,
        height: 44,
        paddingHorizontal: 14,
      }}
      variant={variant}
    >
      <Row alignment="center" spacing={8}>
        {icon ? <Icon color={contentColor} name={icon} size={18} /> : null}
        <Text
          textStyle={{
            color: contentColor,
            fontFamily: fonts.medium,
            fontSize: 14,
            lineHeight: 18,
          }}
        >
          {label}
        </Text>
      </Row>
    </Button>
  );
}
