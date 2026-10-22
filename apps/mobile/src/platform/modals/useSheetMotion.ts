import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, useWindowDimensions } from 'react-native';

// Animate only the panel; its full-screen backdrop is a stationary sibling.
export function useSheetMotion(
  visible: boolean,
  onClose: () => void,
  reduceMotion: boolean,
) {
  const { height } = useWindowDimensions();
  const [offset] = useState(() => new Animated.Value(height));
  const [backdropVisible, setBackdropVisible] = useState(true);
  const openingStarted = useRef(false);
  const closing = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    if (reduceMotion && visible) {
      offset.stopAnimation();
      if (closing.current) {
        closing.current = false;
        offset.setValue(height);
        onClose();
      } else {
        offset.setValue(0);
      }
    }
  }, [visible, height, offset, onClose, reduceMotion]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      closing.current = false;
      offset.stopAnimation();
    };
  }, [offset]);

  const open = useCallback(() => {
    // Layout/show may both fire; never reset a slide that's already started.
    if (!alive.current || !visible || openingStarted.current) return;
    openingStarted.current = true;
    if (reduceMotion) {
      offset.setValue(0);
      return;
    }
    Animated.timing(offset, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [visible, offset, reduceMotion]);

  const close = useCallback(() => {
    if (!alive.current || closing.current) return;
    closing.current = true;
    setBackdropVisible(false);
    if (reduceMotion) {
      offset.setValue(height);
      closing.current = false;
      onClose();
      return;
    }
    Animated.timing(offset, {
      toValue: height,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (finished && closing.current && alive.current) {
        closing.current = false;
        onClose();
      }
    });
  }, [height, offset, onClose, reduceMotion]);
  return { offset, open, close, backdropVisible, reduceMotion };
}
