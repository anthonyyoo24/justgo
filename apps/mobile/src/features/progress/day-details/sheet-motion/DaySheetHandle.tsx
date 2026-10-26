import { useCallback } from 'react';
import { StyleSheet, View, type ViewInstance } from 'react-native';
import type { useDaySheetDrag } from './useDaySheetDrag';

type Controls = Pick<
  ReturnType<typeof useDaySheetDrag>,
  | 'panHandlers'
  | 'attachHandle'
  | 'expanded'
  | 'canExpand'
  | 'toggle'
  | 'preparePress'
  | 'expand'
  | 'collapse'
>;

export function DaySheetHandle({ controls }: { controls: Controls }) {
  const attach = controls.attachHandle;
  const handleRef = useCallback(
    (view: ViewInstance | null) => attach(view),
    [attach],
  );
  return (
    <View ref={handleRef} {...controls.panHandlers} testID="day-sheet-handle">
      <View
        accessibilityRole={controls.canExpand ? 'adjustable' : undefined}
        accessibilityLabel={
          controls.canExpand ? 'Resize day details' : undefined
        }
        accessibilityHint={
          controls.canExpand
            ? 'Activate to expand or shrink. Drag to adjust height.'
            : undefined
        }
        accessibilityState={{ expanded: controls.expanded }}
        accessibilityValue={{
          min: 0,
          max: 1,
          now: controls.expanded ? 1 : 0,
          text: controls.expanded ? 'Expanded' : 'Compact',
        }}
        aria-expanded={controls.canExpand ? controls.expanded : undefined}
        accessibilityActions={[
          { name: 'increment', label: 'Expand day details' },
          { name: 'decrement', label: 'Shrink day details' },
          { name: 'activate', label: 'Resize day details' },
        ]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'increment') controls.expand();
          else if (nativeEvent.actionName === 'decrement') controls.collapse();
          else if (nativeEvent.actionName === 'activate') {
            controls.preparePress();
            controls.toggle();
          }
        }}
        accessible={controls.canExpand}
        focusable={controls.canExpand}
        style={styles.touchArea}
      >
        <View style={styles.grabber} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  touchArea: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 10,
  },
  grabber: {
    width: 52,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#DDDAD6',
  },
});
