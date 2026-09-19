import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";

import { useAppColors, useResolvedColorScheme } from "@/lib/config/colors";
import { fonts } from "@/lib/config/constants";

export function HeaderTitle() {
  const colors = useAppColors();
  const colorScheme = useResolvedColorScheme();
  const logo =
    colorScheme === "dark"
      ? require("../../../assets/images/icon-dark.svg")
      : require("../../../assets/images/icon-light.svg");

  return (
    <View style={headerStyles.title}>
      <Image source={logo} style={headerStyles.logo} />
      <Text style={[headerStyles.titleText, { color: colors.text }]}>Runa</Text>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  title: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  logo: {
    borderRadius: 10,
    height: 40,
    width: 40,
  },
  titleText: {
    fontFamily: fonts.semiBold,
    fontSize: 18,
    lineHeight: 22,
  },
});
