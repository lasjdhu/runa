import arrowDropDownIcon from "@expo/material-symbols/arrow_drop_down.xml";
import checkIcon from "@expo/material-symbols/check.xml";
import darkModeIcon from "@expo/material-symbols/dark_mode.xml";
import devicesIcon from "@expo/material-symbols/devices.xml";
import folderManagedIcon from "@expo/material-symbols/folder_managed.xml";
import lightModeIcon from "@expo/material-symbols/light_mode.xml";
import Constants from "expo-constants";
import { Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  AppState,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  DropdownMenuItem,
  ExposedDropdownMenu,
  ExposedDropdownMenuBox,
  FilledTonalIconButton,
  Host,
  Icon,
  Shape,
  Switch,
  Text as ComposeText,
  TextField,
  useNativeState,
} from "@expo/ui/jetpack-compose";
import {
  background,
  menuAnchor,
  size,
} from "@expo/ui/jetpack-compose/modifiers";

import {
  type AppColors,
  useAppColors,
  useResolvedColorScheme,
} from "@/lib/config/colors";
import { fonts } from "@/lib/config/constants";
import {
  checkAllFilesPermission,
  openAppAllFilesAccessSettings,
} from "@/lib/hooks/useScanFileSystem";
import { type ThemePreference, useSettingsStore } from "@/lib/store";
import {
  ScanPermissionDialog,
  type ScanPermissionDialogMode,
} from "@/components/molecules";

type SettingSectionProps = {
  children: React.ReactNode;
  styles: ReturnType<typeof createStyles>;
  title: string;
};

type SettingRowProps = {
  children?: React.ReactNode;
  detail?: string;
  title: string;
  trailing?: React.ReactNode;
  styles: ReturnType<typeof createStyles>;
};

function SettingSection({ children, styles, title }: SettingSectionProps) {
  return (
    <View style={styles.sectionBlock}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function SettingRow({
  children,
  detail,
  title,
  trailing,
  styles,
}: SettingRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.itemTitle}>{title}</Text>
        {detail ? <Text style={styles.itemDetail}>{detail}</Text> : null}
        {children}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

function Divider({ styles }: { styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.divider} />;
}

function ThemePicker({
  colorScheme,
  colors,
}: {
  colorScheme: "dark" | "light";
  colors: AppColors;
}) {
  const [expanded, setExpanded] = useState(false);
  const themePreference = useSettingsStore((state) => state.themePreference);
  const setThemePreference = useSettingsStore(
    (state) => state.setThemePreference,
  );
  const options: {
    icon: typeof devicesIcon;
    label: string;
    value: ThemePreference;
  }[] = [
    { icon: devicesIcon, label: "System", value: "system" },
    { icon: lightModeIcon, label: "Light", value: "light" },
    { icon: darkModeIcon, label: "Dark", value: "dark" },
  ];
  const selectedLabel =
    options.find((option) => option.value === themePreference)?.label ??
    "System";
  const selectedLabelState = useNativeState(selectedLabel);

  useEffect(() => {
    selectedLabelState.set(selectedLabel);
  }, [selectedLabel, selectedLabelState]);

  return (
    <Host
      colorScheme={colorScheme}
      seedColor={colors.accent}
      style={themePickerStyles.host}
    >
      <ExposedDropdownMenuBox
        expanded={expanded}
        onExpandedChange={setExpanded}
      >
        <TextField
          colors={{
            focusedContainerColor: colors.background,
            unfocusedContainerColor: colors.background,
            focusedIndicatorColor: "transparent",
            unfocusedIndicatorColor: "transparent",
            focusedTextColor: colors.text,
            unfocusedTextColor: colors.text,
            focusedTrailingIconColor: colors.textMuted,
            unfocusedTrailingIconColor: colors.textMuted,
          }}
          modifiers={[size(144, 48), menuAnchor()]}
          readOnly
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
            color: colors.text,
            fontSize: 14,
            fontWeight: "500",
            lineHeight: 20,
          }}
          value={selectedLabelState}
        >
          <TextField.TrailingIcon>
            <Icon
              contentDescription="Open theme menu"
              size={22}
              source={arrowDropDownIcon}
              tint={colors.textMuted}
            />
          </TextField.TrailingIcon>
        </TextField>
        <ExposedDropdownMenu
          containerColor={colors.surfaceRaised}
          expanded={expanded}
          modifiers={[background(colors.surfaceRaised)]}
          onDismissRequest={() => {
            setExpanded(false);
          }}
        >
          {options.map((option) => (
            <DropdownMenuItem
              elementColors={{
                leadingIconColor: colors.accent,
                trailingIconColor: colors.accent,
                textColor: colors.text,
              }}
              key={option.value}
              modifiers={[
                background(
                  option.value === themePreference
                    ? colors.background
                    : colors.surfaceRaised,
                ),
              ]}
              onClick={() => {
                setThemePreference(option.value);
                setExpanded(false);
              }}
            >
              <DropdownMenuItem.Text>
                <ComposeText color={colors.text}>{option.label}</ComposeText>
              </DropdownMenuItem.Text>
              <DropdownMenuItem.LeadingIcon>
                <Icon source={option.icon} size={20} tint={colors.accent} />
              </DropdownMenuItem.LeadingIcon>
              {option.value === themePreference ? (
                <DropdownMenuItem.TrailingIcon>
                  <Icon source={checkIcon} size={20} tint={colors.accent} />
                </DropdownMenuItem.TrailingIcon>
              ) : null}
            </DropdownMenuItem>
          ))}
        </ExposedDropdownMenu>
      </ExposedDropdownMenuBox>
    </Host>
  );
}

export default function Settings() {
  const colors = useAppColors();
  const colorScheme = useResolvedColorScheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [hasAllFilesPermission, setHasAllFilesPermission] = useState(false);
  const [scanPermissionDialogMode, setScanPermissionDialogMode] =
    useState<ScanPermissionDialogMode | null>(null);
  const autoscanEnabled = useSettingsStore((state) => state.autoscanEnabled);
  const anonymousStatsEnabled = useSettingsStore(
    (state) => state.anonymousStatsEnabled,
  );
  const setAutoscanEnabled = useSettingsStore(
    (state) => state.setAutoscanEnabled,
  );
  const setAnonymousStatsEnabled = useSettingsStore(
    (state) => state.setAnonymousStatsEnabled,
  );
  const switchColors = useMemo(
    () => ({
      checkedThumbColor: colors.background,
      checkedTrackColor: colors.accent,
      checkedBorderColor: colors.accent,
      uncheckedThumbColor: colors.textMuted,
      uncheckedTrackColor: colors.surface,
      uncheckedBorderColor: colors.border,
    }),
    [colors],
  );

  useEffect(() => {
    const refresh = async () => {
      const granted = await checkAllFilesPermission();
      setHasAllFilesPermission(granted);
    };

    void refresh();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refresh();
      }
    });

    return () => sub.remove();
  }, []);

  const handleAutoscanChange = (enabled: boolean) => {
    setAutoscanEnabled(enabled);

    if (enabled) {
      void checkAllFilesPermission().then((granted) => {
        setHasAllFilesPermission(granted);

        if (!granted) {
          setScanPermissionDialogMode("auto");
        }
      });
    }
  };

  const handleAllowScanAccess = () => {
    setScanPermissionDialogMode(null);
    void openAppAllFilesAccessSettings();
  };

  const handleDisableAutoscan = () => {
    setScanPermissionDialogMode(null);
    setAutoscanEnabled(false);
  };

  const isAndroid11Plus = Platform.OS === "android" && Platform.Version >= 30;
  const appName = Constants.expoConfig?.name ?? "Runa";
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  return (
    <>
      <Stack.Header
        style={{
          backgroundColor: colors.background,
          color: colors.text,
          shadowColor: "transparent",
        }}
      />
      <Stack.Title
        style={{
          color: colors.text,
          fontWeight: "600",
        }}
      >
        Settings
      </Stack.Title>

      <ScrollView contentContainerStyle={styles.page} style={styles.scroll}>
        <SettingSection styles={styles} title="General">
          {isAndroid11Plus ? (
            <>
              <SettingRow
                detail={
                  hasAllFilesPermission
                    ? "Runa can scan shared storage"
                    : "Open Android settings to allow shared storage scanning"
                }
                styles={styles}
                title="All files access"
                trailing={
                  <Host
                    colorScheme={colorScheme}
                    matchContents
                    seedColor={colors.accent}
                  >
                    <FilledTonalIconButton
                      key={`${colorScheme}-${hasAllFilesPermission}`}
                      colors={{
                        containerColor: colors.accent,
                        contentColor: colors.background,
                      }}
                      onClick={openAppAllFilesAccessSettings}
                    >
                      <Icon
                        contentDescription="Open all files access settings"
                        size={22}
                        source={folderManagedIcon}
                      />
                    </FilledTonalIconButton>
                  </Host>
                }
              />
              <Divider styles={styles} />
            </>
          ) : null}

          <SettingRow
            detail="Scan for books on fresh app start"
            styles={styles}
            title="Autoscan"
            trailing={
              <Host
                colorScheme={colorScheme}
                matchContents
                seedColor={colors.accent}
              >
                <Switch
                  colors={switchColors}
                  onCheckedChange={handleAutoscanChange}
                  value={autoscanEnabled}
                />
              </Host>
            }
          />
          <Divider styles={styles} />
          <SettingRow
            detail="Use the device theme or choose one"
            styles={styles}
            title="Theme"
            trailing={<ThemePicker colorScheme={colorScheme} colors={colors} />}
          />
        </SettingSection>

        <SettingSection styles={styles} title="Other">
          <SettingRow
            detail="Share anonymous diagnostics and performance metrics"
            styles={styles}
            title="Anonymous statistics"
            trailing={
              <Host
                colorScheme={colorScheme}
                matchContents
                seedColor={colors.accent}
              >
                <Switch
                  colors={switchColors}
                  onCheckedChange={setAnonymousStatsEnabled}
                  value={anonymousStatsEnabled}
                />
              </Host>
            }
          />
          <Divider styles={styles} />
          <SettingRow
            detail={`Version ${appVersion}`}
            styles={styles}
            title={appName}
          />
        </SettingSection>
      </ScrollView>
      {scanPermissionDialogMode ? (
        <ScanPermissionDialog
          mode={scanPermissionDialogMode}
          onAllow={handleAllowScanAccess}
          onDisable={handleDisableAutoscan}
          onDismiss={() => {
            setScanPermissionDialogMode(null);
          }}
        />
      ) : null}
    </>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    scroll: {
      backgroundColor: colors.background,
      flex: 1,
    },
    page: {
      backgroundColor: colors.background,
      gap: 18,
      paddingBottom: 36,
      paddingHorizontal: 18,
      paddingTop: 18,
    },
    sectionBlock: {
      gap: 8,
    },
    sectionTitle: {
      color: colors.textMuted,
      fontFamily: fonts.medium,
      fontSize: 12,
      letterSpacing: 0.6,
      textTransform: "uppercase",
    },
    card: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: "hidden",
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: 14,
      minHeight: 68,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    rowText: {
      flex: 1,
      gap: 4,
      minWidth: 0,
    },
    itemTitle: {
      color: colors.text,
      fontFamily: fonts.medium,
      fontSize: 15,
      lineHeight: 20,
    },
    itemDetail: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 13,
      lineHeight: 18,
    },
    trailing: {
      alignItems: "center",
      justifyContent: "center",
      minWidth: 92,
    },
    divider: {
      backgroundColor: colors.border,
      height: StyleSheet.hairlineWidth,
    },
  });

const themePickerStyles = StyleSheet.create({
  host: {
    height: 48,
    width: 144,
  },
});
