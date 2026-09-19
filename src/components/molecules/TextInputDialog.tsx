import { useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import {
  AlertDialog,
  Host,
  Shape,
  Text as ComposeText,
  TextButton,
  TextField,
  type TextFieldRef,
  useNativeState,
} from "@expo/ui/jetpack-compose";
import { fillMaxWidth, height } from "@expo/ui/jetpack-compose/modifiers";

import { useAppColors, useResolvedColorScheme } from "@/lib/config/colors";

type TextInputDialogProps = {
  autoSelect?: boolean;
  confirmLabel?: string;
  defaultValue: string;
  dismissLabel?: string;
  inputMode?: "text" | "password";
  message?: string;
  onConfirm: (value: string) => void;
  onDismiss: () => void;
  title: string;
};

export function TextInputDialog({
  autoSelect = false,
  confirmLabel = "OK",
  defaultValue,
  dismissLabel = "Cancel",
  inputMode = "text",
  message,
  onConfirm,
  onDismiss,
  title,
}: TextInputDialogProps) {
  const colors = useAppColors();
  const colorScheme = useResolvedColorScheme();
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<TextFieldRef | null>(null);
  const textState = useNativeState(defaultValue);

  useEffect(() => {
    const timeout = setTimeout(() => {
      inputRef.current?.focus();

      if (autoSelect) {
        void inputRef.current?.setSelection(0, defaultValue.length);
      }
    }, 120);

    return () => {
      clearTimeout(timeout);
    };
  }, [autoSelect, defaultValue.length]);

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
        onDismissRequest={onDismiss}
        tonalElevation={0}
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
            {title}
          </ComposeText>
        </AlertDialog.Title>
        <AlertDialog.Text>
          <TextField
            autoFocus
            colors={{
              cursorColor: colors.accent,
              focusedContainerColor: colors.background,
              focusedIndicatorColor: colors.accent,
              focusedTextColor: colors.text,
              unfocusedContainerColor: colors.background,
              unfocusedIndicatorColor: colors.border,
              unfocusedTextColor: colors.text,
            }}
            keyboardOptions={{
              autoCorrectEnabled: false,
              capitalization: "none",
              imeAction: "done",
              keyboardType: inputMode === "password" ? "password" : "text",
            }}
            modifiers={[fillMaxWidth(), height(56)]}
            onValueChange={setValue}
            ref={inputRef}
            shape={Shape.RoundedCorner({
              cornerRadii: {
                bottomEnd: 8,
                bottomStart: 8,
                topEnd: 8,
                topStart: 8,
              },
            })}
            singleLine
            textStyle={{
              fontSize: 16,
              lineHeight: 22,
            }}
            value={textState}
            visualTransformation={
              inputMode === "password" ? "password" : "none"
            }
          >
            {message ? (
              <TextField.Label>
                <ComposeText color={colors.textMuted}>{message}</ComposeText>
              </TextField.Label>
            ) : null}
          </TextField>
        </AlertDialog.Text>
        <AlertDialog.ConfirmButton>
          <TextButton
            colors={{
              contentColor: colors.accent,
            }}
            onClick={() => {
              onConfirm(value);
            }}
          >
            <ComposeText color={colors.accent}>{confirmLabel}</ComposeText>
          </TextButton>
        </AlertDialog.ConfirmButton>
        <AlertDialog.DismissButton>
          <TextButton
            colors={{
              contentColor: colors.textMuted,
            }}
            onClick={onDismiss}
          >
            <ComposeText color={colors.textMuted}>{dismissLabel}</ComposeText>
          </TextButton>
        </AlertDialog.DismissButton>
      </AlertDialog>
    </Host>
  );
}
