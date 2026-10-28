import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  PanResponder,
  type LayoutChangeEvent,
  type ViewInstance,
} from 'react-native';
import {
  daySheetDragHeight,
  daySheetHeights,
  daySheetRelease,
  type SheetHeights,
} from './day-sheet-geometry';

type Options = {
  visible: boolean;
  windowHeight: number;
  topInset: number;
  bottomInset: number;
  keyboardVisible: boolean;
  fallbackHeight: number;
  hasMore: boolean;
  reduceMotion: boolean;
};

/** Bounded handle resizing; closing remains exclusively with the sheet owner. */
export function useDaySheetDrag(options: Options) {
  const { windowHeight, topInset, bottomInset, fallbackHeight, hasMore } =
    options;
  const [measurements, setMeasurements] = useState({
    available: 0,
    header: 0,
    firstRow: 0,
    content: 0,
    complete: false,
  });
  const bounds = useMemo(
    () =>
      daySheetHeights({
        availableHeight: measurements.available,
        headerHeight: measurements.header,
        firstRowHeight: measurements.firstRow,
        contentHeight: measurements.content,
        complete:
          (measurements.complete || measurements.content === 0) && !hasMore,
        windowHeight,
        topInset,
        bottomInset,
        fallbackHeight,
      }),
    [
      measurements,
      windowHeight,
      topInset,
      bottomInset,
      fallbackHeight,
      hasMore,
    ],
  );
  const [height] = useState(() => new Animated.Value(bounds.compact));
  const [restingHeight, setRestingHeight] = useState(bounds.compact);
  const preferred = useRef<number | null>(null);
  const suppressPress = useRef(false);
  const activeDrag = useRef<{
    start: number;
    keyboard: boolean;
    dismissedKeyboard: boolean;
    limits: SheetHeights;
  } | null>(null);
  const current = useRef({ options, bounds });
  useLayoutEffect(() => {
    current.current = { options, bounds };
  });

  const settle = useCallback(
    (preference: number | null, animate: boolean) => {
      const { options: latest, bounds: limits } = current.current;
      preferred.current = preference;
      height.stopAnimation();
      const target = latest.keyboardVisible
        ? limits.expanded
        : daySheetRelease(preference ?? limits.compact, 0, limits);
      setRestingHeight(target);
      if (!animate || latest.reduceMotion) height.setValue(target);
      else
        Animated.timing(height, {
          toValue: target,
          duration: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
    },
    [height],
  );
  useEffect(
    () => () => {
      activeDrag.current = null;
      height.stopAnimation();
    },
    [height],
  );
  useLayoutEffect(() => {
    const drag = activeDrag.current;
    // Content can remeasure while the viewport moves. Keep finger ownership
    // until release; a real space/keyboard change safely interrupts it.
    if (
      drag &&
      options.visible &&
      drag.limits.maximum === bounds.maximum &&
      drag.keyboard === options.keyboardVisible
    )
      return;
    activeDrag.current = null;
    if (!options.visible) preferred.current = null;
    settle(preferred.current, false);
  }, [
    bounds.minimum,
    bounds.compact,
    bounds.expanded,
    bounds.maximum,
    options.visible,
    options.keyboardVisible,
    options.reduceMotion,
    settle,
  ]);

  const preparePress = useCallback(() => {
    suppressPress.current = false;
  }, []);
  const toggle = useCallback(() => {
    if (suppressPress.current) {
      suppressPress.current = false;
      return;
    }
    const limits = current.current.bounds;
    const shouldExpand =
      (preferred.current ?? limits.compact) < limits.expanded - 1;
    if (limits.expanded - limits.minimum > 1)
      settle(shouldExpand ? limits.expanded : limits.minimum, true);
  }, [settle]);
  const expand = useCallback(
    () => settle(current.current.bounds.expanded, true),
    [settle],
  );
  const collapse = useCallback(() => {
    if (current.current.options.keyboardVisible) Keyboard.dismiss();
    else settle(current.current.bounds.minimum, true);
  }, [settle]);
  const beginDrag = useCallback(() => {
    suppressPress.current = true;
    height.stopAnimation((value) => {
      activeDrag.current = {
        start: value,
        keyboard: current.current.options.keyboardVisible,
        dismissedKeyboard: false,
        limits: current.current.bounds,
      };
    });
  }, [height]);
  const moveDrag = useCallback(
    (dy: number) => {
      const drag = activeDrag.current;
      if (!drag) return;
      if (drag.keyboard) {
        if (dy > 6 && !drag.dismissedKeyboard) {
          drag.dismissedKeyboard = true;
          Keyboard.dismiss();
        }
        return;
      }
      height.setValue(daySheetDragHeight(drag.start, dy, drag.limits));
    },
    [height],
  );
  const releaseDrag = useCallback(
    (dy: number) => {
      const drag = activeDrag.current;
      activeDrag.current = null;
      if (!drag) return;
      settle(
        drag.keyboard
          ? preferred.current
          : daySheetRelease(drag.start, dy, current.current.bounds),
        true,
      );
    },
    [settle],
  );
  const cancelDrag = useCallback(() => {
    activeDrag.current = null;
    settle(preferred.current, true);
  }, [settle]);

  const [responder, setResponder] = useState<ReturnType<
    typeof PanResponder.create
  > | null>(null);
  const handleAttached = useRef(false);
  const attachHandle = useCallback(
    (handle: ViewInstance | null) => {
      if (!handle) {
        handleAttached.current = false;
        activeDrag.current = null;
        return;
      }
      if (handleAttached.current) return;
      handleAttached.current = true;
      setResponder(
        PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: (_event, gesture) =>
            Math.abs(gesture.dy) > 6 &&
            Math.abs(gesture.dy) > Math.abs(gesture.dx),
          onMoveShouldSetPanResponderCapture: (_event, gesture) =>
            Math.abs(gesture.dy) > 6 &&
            Math.abs(gesture.dy) > Math.abs(gesture.dx),
          onPanResponderGrant: beginDrag,
          onPanResponderMove: (_event, gesture) => {
            if (Math.abs(gesture.dy) > Math.abs(gesture.dx))
              moveDrag(gesture.dy);
          },
          onPanResponderRelease: (_event, gesture) => {
            if (Math.abs(gesture.dy) <= 6 && Math.abs(gesture.dx) <= 6) {
              preparePress();
              releaseDrag(0);
              toggle();
            } else if (Math.abs(gesture.dy) > Math.abs(gesture.dx))
              releaseDrag(gesture.dy);
            else cancelDrag();
          },
          onPanResponderTerminate: cancelDrag,
          onPanResponderTerminationRequest: () => true,
        }),
      );
    },
    [beginDrag, moveDrag, releaseDrag, cancelDrag, preparePress, toggle],
  );

  const onAvailableLayout = useCallback(
    ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
      setMeasurements((value) =>
        value.available === layout.height
          ? value
          : { ...value, available: layout.height },
      );
    },
    [],
  );
  const onHeaderLayout = useCallback(
    ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
      setMeasurements((value) =>
        value.header === layout.height
          ? value
          : { ...value, header: layout.height },
      );
    },
    [],
  );
  const onContentLayout = useCallback((content: number, complete: boolean) => {
    setMeasurements((value) =>
      value.content === content && value.complete === complete
        ? value
        : { ...value, content, complete },
    );
  }, []);
  const onFirstRowHeightChange = useCallback((firstRow: number) => {
    setMeasurements((value) =>
      value.firstRow === firstRow ? value : { ...value, firstRow },
    );
  }, []);
  return {
    height,
    expanded: restingHeight >= bounds.expanded - 1,
    canExpand: bounds.expanded - bounds.minimum > 1,
    attachHandle,
    panHandlers: responder?.panHandlers ?? {},
    preparePress,
    toggle,
    expand,
    collapse,
    beginDrag,
    moveDrag,
    releaseDrag,
    cancelDrag,
    onAvailableLayout,
    onHeaderLayout,
    onContentLayout,
    onFirstRowHeightChange,
  };
}
