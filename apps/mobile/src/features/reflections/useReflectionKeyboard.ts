import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  type LayoutChangeEvent,
  type ScrollViewInstance,
} from 'react-native';
import { MotionContext } from '../../platform/motion/motion';

const focusTopInset = 12;
const editorBottomInset = 16;

/** Own the measured space and focus scrolling for the full-screen editor. */
export function useReflectionKeyboard(defaultInputHeight: number) {
  // Standalone presentation fixtures stay still until a preference is available.
  const reduceMotion = useContext(MotionContext)?.reduceMotion ?? true;
  const scrollRef = useRef<ScrollViewInstance>(null);
  const focusedRef = useRef(false);
  const sectionTop = useRef(0);
  const [focused, setFocused] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [sectionHeight, setSectionHeight] = useState(0);
  const [inputTop, setInputTop] = useState(0);
  const inputHeight =
    focused && viewportHeight > 0
      ? Math.max(
          96,
          Math.min(
            defaultInputHeight,
            viewportHeight - inputTop - focusTopInset - editorBottomInset,
          ),
        )
      : defaultInputHeight;
  // Enough trailing room lets the section reach the top even when it is the
  // last content on the page. The footer remains outside this scroll viewport.
  const paddingBottom = focused
    ? Math.max(editorBottomInset, viewportHeight - sectionHeight)
    : editorBottomInset;

  const revealSection = useCallback(() => {
    if (focusedRef.current)
      scrollRef.current?.scrollTo({
        y: Math.max(0, sectionTop.current - focusTopInset),
        animated: !reduceMotion,
      });
  }, [reduceMotion]);

  useEffect(() => {
    // The viewport/content can settle after focus and after the native keyboard
    // animation. Layout callbacks below also handle rotation and keyboard size.
    const shown = Keyboard.addListener('keyboardDidShow', revealSection);
    return () => shown.remove();
  }, [revealSection]);

  useEffect(() => {
    revealSection();
  }, [focused, inputHeight, paddingBottom, revealSection]);

  return {
    scrollRef,
    inputHeight,
    paddingBottom,
    onFocus: () => {
      focusedRef.current = true;
      setFocused(true);
      revealSection();
    },
    onBlur: () => {
      focusedRef.current = false;
      setFocused(false);
    },
    onViewportLayout: ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
      setViewportHeight(layout.height);
      revealSection();
    },
    onSectionLayout: ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
      sectionTop.current = layout.y;
      setSectionHeight(layout.height);
      revealSection();
    },
    onInputLayout: ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
      setInputTop(layout.y);
    },
    onContentSizeChange: revealSection,
  };
}
