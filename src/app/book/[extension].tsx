import { Stack, useLocalSearchParams } from "expo-router";

import {
  BookLoadingIndicator,
  EpubBookReader,
  Fb2BookReader,
  PdfBookReader,
} from "@/components/organisms";

export default function BookRoute() {
  const { extension, id, uri } = useLocalSearchParams<{
    extension?: string;
    id?: string;
    uri?: string;
  }>();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {extension === "pdf" && uri ? (
        <PdfBookReader bookId={id} uri={uri} />
      ) : extension === "epub" ? (
        <EpubBookReader />
      ) : extension === "fb2" ? (
        <Fb2BookReader />
      ) : (
        <BookLoadingIndicator />
      )}
    </>
  );
}
