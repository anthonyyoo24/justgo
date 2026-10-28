export type SheetHeights = {
  minimum: number;
  compact: number;
  expanded: number;
  maximum: number;
};

export function daySheetHeights({
  availableHeight,
  windowHeight,
  topInset,
  bottomInset,
  headerHeight,
  firstRowHeight,
  contentHeight,
  complete,
  fallbackHeight,
}: {
  availableHeight: number;
  windowHeight: number;
  topInset: number;
  bottomInset: number;
  headerHeight: number;
  firstRowHeight: number;
  contentHeight: number;
  complete: boolean;
  fallbackHeight: number;
}): SheetHeights {
  const maximum = Math.max(
    1,
    (availableHeight || windowHeight - topInset) - bottomInset - 12,
  );
  const measured = headerHeight > 0 && contentHeight > 0;
  // Content includes row spacing and any footer, but not the list's top margin.
  // An incomplete batch retains space for the remaining rows to fill ahead.
  const natural = Math.max(
    1,
    measured ? headerHeight + 12 + contentHeight : fallbackHeight - bottomInset,
  );
  const expanded = Math.min(maximum, complete ? natural : maximum);
  const minimum = Math.min(
    expanded,
    firstRowHeight > 0
      ? headerHeight + 12 + firstRowHeight
      : Math.max(headerHeight + 100, windowHeight * 0.4 - bottomInset),
  );
  const compact = Math.max(
    minimum,
    Math.min(
      maximum,
      (windowHeight * 2) / 3 - bottomInset,
      complete || !measured ? natural : Infinity,
    ),
  );
  return { minimum, compact, expanded, maximum };
}

export function daySheetDragHeight(
  start: number,
  dy: number,
  bounds: SheetHeights,
) {
  const requested = start - dy;
  return Math.min(
    bounds.maximum,
    Math.max(
      bounds.minimum,
      requested > bounds.expanded
        ? bounds.expanded + Math.min(40, (requested - bounds.expanded) * 0.25)
        : requested,
    ),
  );
}

/** Resizing stops exactly where released; neither distance nor speed dismisses. */
export function daySheetRelease(
  start: number,
  dy: number,
  bounds: SheetHeights,
) {
  return Math.max(bounds.minimum, Math.min(bounds.expanded, start - dy));
}
