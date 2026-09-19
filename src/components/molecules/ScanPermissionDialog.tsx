import { StyleSheet } from "react-native";
import {
  AlertDialog,
  Host,
  Text as ComposeText,
  TextButton,
} from "@expo/ui/jetpack-compose";

import { useAppColors, useResolvedColorScheme } from "@/lib/config/colors";

export type ScanPermissionDialogMode = "auto" | "manual";

type ScanPermissionDialogProps = {
  mode: ScanPermissionDialogMode;
  onAllow: () => void;
  onDisable?: () => void;
  onDismiss: () => void;
};

export function ScanPermissionDialog({
  mode,
  onAllow,
  onDisable,
  onDismiss,
}: ScanPermissionDialogProps) {
  const colors = useAppColors();
  const colorScheme = useResolvedColorScheme();
  const isAutoscanFailure = mode === "auto";
  const dismissColor = isAutoscanFailure ? colors.danger : colors.textMuted;

  return (
    <Host
      colorScheme={colorScheme}
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
      useViewportSizeMeasurement
    >
      <AlertDialog
        colors={{
          containerColor: colors.surfaceRaised,
          textContentColor: colors.textMuted,
          titleContentColor: colors.text,
        }}
        tonalElevation={0}
        onDismissRequest={onDismiss}
      >
        <AlertDialog.Title>
          <ComposeText
            color={colors.text}
            style={{
              fontSize: 20,
              fontWeight: "600",
              lineHeight: 26,
            }}
          >
            All files access needed
          </ComposeText>
        </AlertDialog.Title>
        <AlertDialog.Text>
          <ComposeText
            color={colors.textMuted}
            style={{
              fontSize: 15,
              lineHeight: 22,
            }}
          >
            Runa needs all files access to scan shared storage for books.
          </ComposeText>
        </AlertDialog.Text>
        <AlertDialog.ConfirmButton>
          <TextButton
            colors={{
              contentColor: colors.accent,
            }}
            onClick={onAllow}
          >
            <ComposeText color={colors.accent}>OK</ComposeText>
          </TextButton>
        </AlertDialog.ConfirmButton>
        <AlertDialog.DismissButton>
          <TextButton
            colors={{
              contentColor: dismissColor,
            }}
            onClick={isAutoscanFailure ? onDisable : onDismiss}
          >
            <ComposeText color={dismissColor}>
              {isAutoscanFailure ? "Disable" : "Not now"}
            </ComposeText>
          </TextButton>
        </AlertDialog.DismissButton>
      </AlertDialog>
    </Host>
  );
}
