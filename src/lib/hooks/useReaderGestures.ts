/* eslint-disable react-hooks/immutability */
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import {
  clamp,
  type ReaderZoomState,
  normalizeReaderZoomState,
} from "@/lib/reader/utils";

const SIDE_TAP_RATIO = 0.32;
const MIN_SCALE = 1;
const MAX_SCALE = 3;
const PAGE_TURN_DISTANCE_RATIO = 0.985;
const SWIPE_DISTANCE = 54;
const SWIPE_VELOCITY = 520;
const TAP_MAX_DISTANCE = 10;

export type VisibleReaderPage = {
  key: string;
  node: ReactNode;
  pageNumber: number;
};

export function useReaderGestures({
  canGoBack,
  canGoForward,
  isZoomLocked,
  lockedZoomState,
  pageKey,
  pageNumber,
  children,
  onGoBack,
  onGoForward,
  onZoomLockChange,
  onZoomStateChange,
  setOverlayVisible,
}: {
  canGoBack: boolean;
  canGoForward: boolean;
  isZoomLocked: boolean;
  lockedZoomState?: ReaderZoomState | null;
  pageKey: string;
  pageNumber: number;
  children: ReactNode;
  onGoBack: () => void;
  onGoForward: () => void;
  onZoomLockChange?: (
    locked: boolean,
    zoomState: ReaderZoomState | null,
  ) => void;
  onZoomStateChange?: (zoomState: ReaderZoomState) => void;
  setOverlayVisible: (visible: boolean) => void;
}) {
  const { width } = useWindowDimensions();
  const [visiblePage, setVisiblePage] = useState<VisibleReaderPage>({
    key: pageKey,
    node: children,
    pageNumber,
  });
  const [outgoingPage, setOutgoingPage] = useState<VisibleReaderPage | null>(
    null,
  );

  const visiblePageRef = useRef(visiblePage);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const isZoomLockedShared = useSharedValue(isZoomLocked);
  const pageTurnProgress = useSharedValue(0);
  const pageTurnDirection = useSharedValue(1);

  const clearOutgoingPage = useCallback(() => {
    setOutgoingPage(null);
  }, []);

  const applyZoomState = useCallback(
    (zoomState: ReaderZoomState, animated = false) => {
      const nextScale = clamp(zoomState.scale, MIN_SCALE, MAX_SCALE);
      const maxOffset = (width * (nextScale - 1)) / 2;
      const nextTranslateX = clamp(zoomState.translateX, -maxOffset, maxOffset);

      if (animated) {
        scale.value = withTiming(nextScale, { duration: 160 });
        translateX.value = withTiming(nextTranslateX, { duration: 160 });
        translateY.value = withTiming(zoomState.translateY, { duration: 160 });
      } else {
        scale.value = nextScale;
        translateX.value = nextTranslateX;
        translateY.value = zoomState.translateY;
      }

      savedScale.value = nextScale;
      savedTranslateX.value = nextTranslateX;
      savedTranslateY.value = zoomState.translateY;
    },
    [
      savedScale,
      savedTranslateX,
      savedTranslateY,
      scale,
      translateX,
      translateY,
      width,
    ],
  );

  useEffect(() => {
    isZoomLockedShared.value = isZoomLocked;

    if (isZoomLocked && lockedZoomState) {
      applyZoomState(lockedZoomState, false);
    }
  }, [applyZoomState, isZoomLocked, isZoomLockedShared, lockedZoomState]);

  useEffect(() => {
    const currentPage = visiblePageRef.current;
    const nextPage = { key: pageKey, node: children, pageNumber };

    if (currentPage.key === pageKey) {
      if (currentPage.node !== children) {
        visiblePageRef.current = nextPage;
        setVisiblePage(nextPage);
      }
      return;
    }

    const direction = pageNumber >= currentPage.pageNumber ? 1 : -1;

    if (isZoomLocked && lockedZoomState) {
      applyZoomState(lockedZoomState, false);
    } else {
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    }
    pageTurnDirection.value = direction;
    pageTurnProgress.value = 1;
    setOutgoingPage(currentPage);
    visiblePageRef.current = nextPage;
    setVisiblePage(nextPage);

    pageTurnProgress.value = withTiming(
      0,
      {
        duration: 240,
        easing: Easing.out(Easing.cubic),
      },
      (finished) => {
        if (finished) {
          runOnJS(clearOutgoingPage)();
        }
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    children,
    applyZoomState,
    clearOutgoingPage,
    isZoomLocked,
    lockedZoomState,
    pageKey,
    pageNumber,
    pageTurnDirection,
    pageTurnProgress,
  ]);

  const resetZoom = useCallback(() => {
    scale.value = withTiming(1, { duration: 160 });
    savedScale.value = 1;
    translateX.value = withTiming(0, { duration: 160 });
    translateY.value = withTiming(0, { duration: 160 });
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, translateX, translateY]);

  const setZoomLocked = useCallback(
    (locked: boolean) => {
      if (!onZoomLockChange) {
        return;
      }

      if (!locked) {
        isZoomLockedShared.value = false;
        onZoomLockChange(false, null);
        return;
      }

      const zoomState = normalizeReaderZoomState({
        scale: scale.value,
        translateX: translateX.value,
        translateY: translateY.value,
      }) ?? {
        scale: 1,
        translateX: 0,
        translateY: 0,
      };

      applyZoomState(zoomState, false);
      isZoomLockedShared.value = true;
      onZoomLockChange(true, zoomState);
    },
    [
      applyZoomState,
      isZoomLockedShared,
      onZoomLockChange,
      scale,
      translateX,
      translateY,
    ],
  );

  const reportZoomState = useCallback(
    (nextScale: number, nextTranslateX: number, nextTranslateY: number) => {
      onZoomStateChange?.({
        scale: nextScale,
        translateX: nextTranslateX,
        translateY: nextTranslateY,
      });
    },
    [onZoomStateChange],
  );

  const turnBack = useCallback(() => {
    if (!canGoBack) return;
    setOverlayVisible(false);
    if (!isZoomLockedShared.value) resetZoom();
    onGoBack();
  }, [canGoBack, isZoomLockedShared, onGoBack, resetZoom, setOverlayVisible]);

  const turnForward = useCallback(() => {
    if (!canGoForward) return;
    setOverlayVisible(false);
    if (!isZoomLockedShared.value) resetZoom();
    onGoForward();
  }, [
    canGoForward,
    isZoomLockedShared,
    onGoForward,
    resetZoom,
    setOverlayVisible,
  ]);

  const handleTap = useCallback(
    (x: number, allowPageTurn: boolean) => {
      const leftEdge = width * SIDE_TAP_RATIO;
      const rightEdge = width * (1 - SIDE_TAP_RATIO);

      if (allowPageTurn && x < leftEdge) {
        turnBack();
        return;
      }

      if (allowPageTurn && x > rightEdge) {
        turnForward();
        return;
      }

      setOverlayVisible(true);
    },
    [setOverlayVisible, turnBack, turnForward, width],
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onUpdate((event) => {
          if (isZoomLockedShared.value) {
            return;
          }

          scale.value = clamp(
            savedScale.value * event.scale,
            MIN_SCALE,
            MAX_SCALE,
          );
        })
        .onEnd(() => {
          if (isZoomLockedShared.value) {
            return;
          }

          savedScale.value = scale.value;
          if (scale.value <= 1.02) {
            scale.value = withTiming(1, { duration: 160 });
            savedScale.value = 1;
            translateX.value = withTiming(0, { duration: 160 });
            translateY.value = withTiming(0, { duration: 160 });
            savedTranslateX.value = 0;
            savedTranslateY.value = 0;
            runOnJS(reportZoomState)(1, 0, 0);
            return;
          }

          runOnJS(reportZoomState)(
            scale.value,
            translateX.value,
            translateY.value,
          );
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reportZoomState],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(8)
        .onUpdate((event) => {
          if (isZoomLockedShared.value) {
            return;
          }

          if (scale.value <= 1) {
            return;
          }
          const maxOffset = (width * (scale.value - 1)) / 2;
          translateX.value = clamp(
            savedTranslateX.value + event.translationX,
            -maxOffset,
            maxOffset,
          );
          translateY.value = savedTranslateY.value + event.translationY;
        })
        .onEnd((event) => {
          if (scale.value > 1 && !isZoomLockedShared.value) {
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
            runOnJS(reportZoomState)(
              scale.value,
              translateX.value,
              translateY.value,
            );
          }

          const isHorizontal =
            Math.abs(event.translationX) > Math.abs(event.translationY) * 1.15;
          const shouldTurn =
            Math.abs(event.translationX) >= SWIPE_DISTANCE ||
            Math.abs(event.velocityX) >= SWIPE_VELOCITY;

          if (!isHorizontal || !shouldTurn) {
            return;
          }

          const isSwipingLeft =
            event.translationX < 0 || event.velocityX < -SWIPE_VELOCITY;

          if (isSwipingLeft) {
            runOnJS(turnForward)();
          } else {
            runOnJS(turnBack)();
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reportZoomState, turnForward, turnBack, width],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(220)
        .maxDistance(TAP_MAX_DISTANCE)
        .onEnd((event, success) => {
          if (success) {
            runOnJS(handleTap)(event.x, true);
          }
        }),
    [handleTap],
  );

  const pageGesture = useMemo(
    () => Gesture.Simultaneous(pinch, Gesture.Exclusive(pan, tap)),
    [pinch, pan, tap],
  );

  const currentPageStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          pageTurnProgress.value *
          pageTurnDirection.value *
          width *
          PAGE_TURN_DISTANCE_RATIO,
      },
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: 1 - pageTurnProgress.value * 0.08,
  }));

  const outgoingPageStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          (pageTurnProgress.value - 1) *
          pageTurnDirection.value *
          width *
          PAGE_TURN_DISTANCE_RATIO,
      },
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: 0.92 + pageTurnProgress.value * 0.08,
  }));

  return {
    currentPageStyle,
    outgoingPage,
    outgoingPageStyle,
    pageGesture,
    setZoomLocked,
    visiblePage,
  };
}
