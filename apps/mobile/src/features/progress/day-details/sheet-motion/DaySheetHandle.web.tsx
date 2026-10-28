import { useRef, type CSSProperties } from 'react';
import type { useDaySheetDrag } from './useDaySheetDrag';

type Controls = ReturnType<typeof useDaySheetDrag>;
type PointerDrag = {
  id: number;
  x: number;
  y: number;
  moved: boolean;
  vertical: boolean;
};

/** Pointer capture keeps the browser grip attached while layout moves beneath it. */
export function DaySheetHandle({ controls }: { controls: Controls }) {
  const pointer = useRef<PointerDrag | null>(null);
  return (
    <button
      type="button"
      data-testid="day-sheet-handle"
      aria-label={controls.canExpand ? 'Resize day details' : undefined}
      aria-expanded={controls.canExpand ? controls.expanded : undefined}
      aria-hidden={!controls.canExpand || undefined}
      tabIndex={controls.canExpand ? 0 : -1}
      style={touchArea}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') controls.preparePress();
      }}
      onClick={controls.toggle}
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0 || pointer.current) return;
        pointer.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          moved: false,
          vertical: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        controls.preparePress();
        controls.beginDrag();
      }}
      onPointerMove={(event) => {
        const drag = pointer.current;
        if (!drag || drag.id !== event.pointerId) return;
        const dy = event.clientY - drag.y;
        const dx = event.clientX - drag.x;
        if (!drag.moved && Math.max(Math.abs(dx), Math.abs(dy)) > 6) {
          drag.moved = true;
          drag.vertical = Math.abs(dy) > Math.abs(dx);
        }
        if (drag.vertical) controls.moveDrag(dy);
      }}
      onPointerUp={(event) => {
        const drag = pointer.current;
        if (!drag || drag.id !== event.pointerId) return;
        pointer.current = null;
        const dy = event.clientY - drag.y;
        if (!drag.moved) controls.preparePress();
        if (drag.vertical || !drag.moved) controls.releaseDrag(dy);
        else controls.cancelDrag();
      }}
      onPointerCancel={(event) => {
        if (pointer.current?.id !== event.pointerId) return;
        pointer.current = null;
        controls.cancelDrag();
      }}
      onLostPointerCapture={(event) => {
        if (pointer.current?.id === event.pointerId) {
          pointer.current = null;
          controls.cancelDrag();
        }
      }}
    >
      <span aria-hidden style={grabber} />
    </button>
  );
}

const touchArea: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  flexDirection: 'column',
  boxSizing: 'border-box',
  width: '100%',
  height: 44,
  flexShrink: 0,
  padding: '10px 0 0',
  margin: 0,
  border: 0,
  background: 'transparent',
  touchAction: 'none',
  userSelect: 'none',
  cursor: 'ns-resize',
};
const grabber: CSSProperties = {
  width: 52,
  height: 6,
  borderRadius: 3,
  backgroundColor: '#DDDAD6',
  flexShrink: 0,
};
