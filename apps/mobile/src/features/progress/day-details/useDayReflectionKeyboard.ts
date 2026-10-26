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
  const [viewportHeight, setViewportHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(
    () => Keyboard.isVisible?.() ?? false,
  );
  const attachScrollView = useCallback((scroll: ScrollViewInstance | null) => {
    scrollRef.current = scroll;
    scrollY.current = 0;
    revision.current += 1;
    setViewportHeight(0);
  }, []);

  useLayoutEffect(() => {
    activeId.current = editingId;
    revision.current += 1;
    return () => {
      activeId.current = null;
      revision.current += 1;
    };
  }, [editingId]);

  const revealEditor = useCallback(() => {
    const scroll = scrollRef.current;
    const editor = editorRef.current;
    if (!activeId.current || !scroll || !editor) return;
    const measuredRevision = ++revision.current;
    const current = () =>
      revision.current === measuredRevision &&
      scrollRef.current === scroll &&
      editorRef.current === editor;
    scroll.measureInWindow((_x, top, _width, height) => {
      if (!current() || height <= 0) return;
      editor.measureInWindow(
        (_editorX, editorTop, _editorWidth, editorHeight) => {
          if (!current() || editorHeight <= 0) return;
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
              animated: !reduceMotion,
            });
        },
      );
    });
  }, [reduceMotion]);

  useEffect(() => {
    const willShow = Keyboard.addListener('keyboardWillShow', () =>
      setKeyboardVisible(true),
    );
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
    onViewportLayout: ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
      setViewportHeight(layout.height);
      revealEditor();
    },
    onScrollOffsetChange: (y: number) => {
      scrollY.current = y;
      revision.current += 1;
    },
  };
}
