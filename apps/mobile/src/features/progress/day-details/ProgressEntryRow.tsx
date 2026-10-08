import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { feelingChoices, type FeelingCode } from '@justgo/contracts';
import type { ProgressEntry } from '../types';
import { colors, fontFamilies, typography } from '../../../theme/tokens';
import { FeelingFace } from '../../reflections/FeelingFace';
import { activityTime } from '../calendar';
import { SlidingEntryDetails } from './SlidingEntryDetails';
import { DayReflectionPlaceholder } from './DayReflectionEditor';
const entryMetaInk = '#5F7391';
const feelingLabel = (feeling: FeelingCode | null) =>
  feelingChoices.find((option) => option.code === feeling)?.label ??
  'Not recorded';
function EntryClockIcon() {
  return (
    <Svg
      testID="entry-clock-icon"
      width={16}
      height={16}
      viewBox="0 0 16 16"
      aria-hidden
    >
      <Circle
        cx={8}
        cy={8}
        r={6.25}
        fill="none"
        stroke={entryMetaInk}
        strokeWidth={1.3}
      />
      <Path
        d="M8 4.2v4.2l2.7 1.8"
        fill="none"
        stroke={entryMetaInk}
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ReflectionPencil() {
  return (
    <Image
      source={require('../../../../assets/icons/reflection-pencil.png')}
      style={styles.reflectionPencil}
      resizeMode="contain"
      aria-hidden
    />
  );
}

function SavedReflection({
  text,
  onEdit,
}: {
  text: string;
  onEdit?: (() => void) | undefined;
}) {
  return (
    <View testID="reflection-content" style={styles.reflection}>
      {!onEdit && (
        <View style={styles.reflectionHeading}>
          <ReflectionPencil />
          <Text style={styles.reflectionLabel}>Saved reflection</Text>
        </View>
      )}
      <Text
        style={[styles.reflectionText, onEdit && styles.editableReflectionText]}
      >
        {text}
      </Text>
      {onEdit && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit reflection"
          onPress={onEdit}
          style={styles.editAction}
        >
          <ReflectionPencil />
          <Text style={styles.reflectionActionText}>Edit</Text>
        </Pressable>
      )}
    </View>
  );
}

export function ProgressEntryRow({
  entry,
  index,
  expanded,
  onToggle,
  reduceMotion,
  onEdit,
  editor,
  editing = !!editor,
  onEditorOpened,
}: {
  entry: ProgressEntry;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  reduceMotion: boolean;
  onEdit?: (() => void) | undefined;
  editor?: ReactNode;
  editing?: boolean;
  onEditorOpened?: (() => void) | undefined;
}) {
  const submitted = entry.reflectionStatus === 'submitted';
  const feeling = submitted ? entry.feeling : null;
  const reflection = submitted ? entry.reflectionText?.trim() : null;
  const opened = (!!reflection && expanded) || editing;
  const action =
    editing && !reflection
      ? 'Cancel'
      : opened
        ? 'Hide Reflection'
        : reflection
          ? 'View Reflection'
          : 'Add reflection';
  const actionable = !!reflection || !!onEdit;
  const Row = actionable ? Pressable : View;
  const time = activityTime(entry.startedAt, entry.timeZone);

  return (
    <View style={styles.entry}>
      <Row
        accessible
        accessibilityRole={actionable ? 'button' : undefined}
        accessibilityLabel={`Rep ${index + 1}. ${entry.instruction}. ${time}. Feeling: ${feelingLabel(feeling)}${actionable ? `. ${action}` : ''}`}
        accessibilityState={actionable ? { expanded: opened } : undefined}
        onPress={reflection || editing ? onToggle : onEdit}
        hitSlop={actionable ? { top: 12, bottom: 12 } : undefined}
        style={styles.entryRow}
      >
        <Text style={styles.ordinal}>{String(index + 1).padStart(2, '0')}</Text>
        <View style={styles.entryMain}>
          <Text
            numberOfLines={opened ? undefined : 2}
            style={styles.entryTitle}
          >
            {entry.instruction}
          </Text>
          <View testID="entry-metadata-row" style={styles.entryMeta}>
            <View style={styles.entryMetaItem}>
              <EntryClockIcon />
              <Text style={styles.entryMetaText}>{time}</Text>
            </View>
            {actionable && (
              <View testID="reflection-action" style={styles.reflectionAction}>
                <View style={styles.reflectionDivider} aria-hidden />
                {!reflection && (
                  <Svg
                    testID={
                      editing ? 'cancel-reflection-icon' : 'add-reflection-icon'
                    }
                    width={13}
                    height={13}
                    viewBox="0 0 16 16"
                    style={{ flexShrink: 0 }}
                    aria-hidden
                  >
                    <Path
                      d={editing ? 'M3.5 3.5l9 9m0-9-9 9' : 'M8 2v12M2 8h12'}
                      fill="none"
                      stroke={colors.ink}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                    />
                  </Svg>
                )}
                <Text style={styles.reflectionActionText}>{action}</Text>
                {!!reflection && (
                  <Svg
                    testID="reflection-chevron"
                    width={11}
                    height={11}
                    viewBox="0 0 11 11"
                    aria-hidden
                  >
                    <Path
                      d={opened ? 'm1.5 7 4-4 4 4' : 'm1.5 4 4 4 4-4'}
                      fill="none"
                      stroke="#647D99"
                      strokeWidth={1.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                )}
              </View>
            )}
          </View>
        </View>
        <View testID="entry-feeling" style={styles.feeling}>
          <Text style={styles.after}>Feeling</Text>
          {feeling ? (
            <FeelingFace feeling={feeling} size={36} selected={false} />
          ) : (
            <Svg
              testID="empty-feeling-circle"
              width={36}
              height={36}
              viewBox="0 0 36 36"
              aria-hidden
            >
              <Circle
                cx="18"
                cy="18"
                r="16.5"
                fill="none"
                stroke="#9AAAC0"
                strokeWidth="1.6"
                strokeDasharray="0.1 4.2"
                strokeLinecap="round"
              />
            </Svg>
          )}
        </View>
      </Row>
      {actionable && (
        <SlidingEntryDetails
          open={opened}
          reduceMotion={reduceMotion}
          contentKey={reflection && !editor ? 'saved' : 'editor'}
          onOpened={editing ? onEditorOpened : undefined}
        >
          {editor ??
            (reflection ? (
              <SavedReflection text={reflection} onEdit={onEdit} />
            ) : (
              <DayReflectionPlaceholder />
            ))}
        </SlidingEntryDetails>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  entry: {
    borderTopWidth: 1,
    borderTopColor: '#E8E3DE',
    minHeight: 73,
    paddingVertical: 12,
  },
  entryRow: { flexDirection: 'row', gap: 9 },
  ordinal: {
    fontFamily: fontFamilies.display,
    fontSize: 17,
    color: '#5F7391',
    width: 30,
    transform: [{ translateY: 6 }],
  },
  entryMain: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: '#DDDAD5',
    paddingLeft: 12,
  },
  entryTitle: {
    fontFamily: fontFamilies.editorial,
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.15,
    lineHeight: 22,
  },
  entryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 4,
    minHeight: 17,
    marginTop: 7,
  },
  entryMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  entryMetaText: {
    fontFamily: fontFamilies.regular,
    color: entryMetaInk,
    fontSize: 12,
    lineHeight: 17,
  },
  reflectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    minHeight: 17,
  },
  reflectionDivider: {
    width: 1,
    height: 15,
    backgroundColor: '#C7CDD2',
    marginRight: 2,
  },
  reflectionPencil: { width: 15.305, height: 16.464, flexShrink: 0 },
  reflectionActionText: {
    fontFamily: fontFamilies.regular,
    color: '#6B809B',
    fontSize: 12,
    lineHeight: 17,
  },
  feeling: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  after: { fontFamily: fontFamilies.regular, color: '#7287A3', fontSize: 11 },
  reflection: {
    backgroundColor: '#FAEFEB',
    borderRadius: 8,
    padding: 12,
  },
  reflectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reflectionLabel: { ...typography.caption, color: '#6B809B' },
  editAction: {
    position: 'absolute',
    right: 4,
    top: 0,
    minWidth: 54,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  editableReflectionText: { paddingRight: 56, marginTop: 0 },
  reflectionText: {
    fontFamily: fontFamilies.display,
    fontStyle: 'italic',
    fontSize: 18,
    lineHeight: 24,
    color: colors.ink,
    marginTop: 6,
  },
});
