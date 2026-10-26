import {
  createContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  Keyboard,
  type LayoutChangeEvent,
  type ScrollViewInstance,
  type ViewInstance,
} from 'react-native';

export const DayReflectionViewport = createContext(0);
const edgeGap = 12;

/** Reveal the entire active form, including its actions, after native layout settles. */
export function useDayReflectionKeyboard(
  editingId: string | null | undefined,
  reduceMotion: boolean,
) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const editorRef = useRef<ViewInstance>(null);
  const scrollY = useRef(0);
  const revision = useRef(0);
  const activeId = useRef(editingId);
  const frame = useRef<number | null>(null);
  const pending = useRef(false);
  const reduced = useRef(reduceMotion);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(
    () => Keyboard.isVisible?.() ?? false,
  );
  const cancelReveal = useCallback(() => {
    pending.current = false;
    revision.current += 1;
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
  }, []);
  const attachScrollView = useCallback(
    (scroll: ScrollViewInstance | null) => {
      cancelReveal();
      scrollRef.current = scroll;
      scrollY.current = 0;
      setViewportHeight(0);
    },
    [cancelReveal],
  );

  useLayoutEffect(() => {
    reduced.current = reduceMotion;
  }, [reduceMotion]);

  useLayoutEffect(() => {
    activeId.current = editingId;
    cancelReveal();
    return () => {
      activeId.current = null;
      cancelReveal();
    };
  }, [cancelReveal, editingId]);

  const measureEditor = useCallback(() => {
    const scroll = scrollRef.current;
    const editor = editorRef.current;
    if (!pending.current || !activeId.current || !scroll || !editor) return;
    const measuredRevision = revision.current;
    const current = () =>
      pending.current &&
      revision.current === measuredRevision &&
      scrollRef.current === scroll &&
      editorRef.current === editor;
    scroll.measureInWindow((_x, top, _width, height) => {
      if (!current()) return;
      if (height <= 0) {
        pending.current = false;
        return;
      }
      editor.measureInWindow(
        (_editorX, editorTop, _editorWidth, editorHeight) => {
          if (!current()) return;
          // Once a fresh measurement finishes, ordinary manual/programmatic
          // scrolling must not start another reveal request.
          pending.current = false;
          if (editorHeight <= 0) return;
          const bottom = Math.min(
            top + height,
            Keyboard.metrics?.()?.screenY ?? Infinity,
          );
          const overflow = editorTop + editorHeight - (bottom - edgeGap);
          const above = editorTop - (top + edgeGap);
          // If unusually large text cannot fit, start at the field and retain
          // normal manual scrolling. Never jump to the end of the entire day.
          const delta =
            above < 0 || editorHeight > bottom - top - edgeGap * 2
              ? above
              : Math.max(0, overflow);
          if (Math.abs(delta) > 0.5)
            scroll.scrollTo({
              y: Math.max(0, scrollY.current + delta),
              animated: !reduced.current,
            });
        },
      );
    });
  }, []);
  const queueMeasurement = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      measureEditor();
    });
  }, [measureEditor]);
  const revealEditor = useCallback(() => {
    if (!activeId.current || !scrollRef.current || !editorRef.current) return;
    pending.current = true;
    revision.current += 1;
    // Focus, keyboard and layout notifications can share one post-layout pass.
    queueMeasurement();
  }, [queueMeasurement]);
  const onScrollOffsetChange = useCallback(
    (y: number) => {
      if (scrollY.current === y) return;
      scrollY.current = y;
      if (!pending.current) return;
      // Browser focus and scroll-range clamps can move content between native
      // measurements. Retry only the already-owned reveal with fresh geometry.
      revision.current += 1;
      queueMeasurement();
    },
    [queueMeasurement],
  );

  useEffect(() => {
    const willShow = Keyboard.addListener('keyboardWillShow', () => {
      setKeyboardVisible(true);
      revealEditor();
    });
    const didShow = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
      revealEditor();
    });
    const changed = Keyboard.addListener(
      'keyboardDidChangeFrame',
      revealEditor,
    );
    const hidden = Keyboard.addListener('keyboardDidHide', () =>
      setKeyboardVisible(false),
    );
    return () => {
      willShow.remove();
      didShow.remove();
      changed.remove();
      hidden.remove();
    };
  }, [revealEditor]);

  return {
    scrollRef,
    attachScrollView,
    editorRef,
    viewportHeight,
    keyboardVisible: !!editingId && keyboardVisible,
    revealEditor,
    cancelReveal,
    onViewportLayout: ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
      setViewportHeight(layout.height);
      revealEditor();
    },
    onScrollOffsetChange,
  };
}
