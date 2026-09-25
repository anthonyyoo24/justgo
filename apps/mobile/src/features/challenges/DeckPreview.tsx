import { useState } from 'react';
import { venues, type Attempt, type Venue } from '@justgo/contracts';
import { ChallengeLayout } from './ChallengeLayout';
import { ChallengeDeck } from './ChallengeDeck';
import { ActiveChallenge } from './ChallengeScreen';
import { VenueTabs } from './VenueTabs';
// Deterministic Paper copy for repeatable comparisons, isolated from saved activity.
const references: Record<Venue, string> = {
  streets: 'Say hello to someone on your walk.',
  park: 'Say hello to someone on your walk.',
  gym: 'Say hello to someone between sets.',
  cafe: 'Ask someone for their favorite local spot.',
  bookstore: 'Ask someone for a book recommendation.',
  bars: 'Introduce yourself to someone new.',
};
export function DeckPreview({ insetTop = true }: { insetTop?: boolean }) {
  const [selected, setSelected] = useState<Venue>('cafe');
  const [turn, setTurn] = useState(0);
  const [active, setActive] = useState<Attempt | null>(null);
  const cards = [
    { id: 'reference', text: references[selected] },
    {
      id: 'long-text',
      text: 'Ask someone nearby for a recommendation for a place they enjoy visiting in the neighborhood.',
    },
    { id: 'short-text', text: 'Say hello.' },
  ];
  const offset = turn % cards.length;
  const ordered = [...cards.slice(offset), ...cards.slice(0, offset)];
  return (
    <ChallengeLayout
      title={active ? 'Active challenge' : 'Find a challenge'}
      insetTop={insetTop}
    >
      {active ? (
        <ActiveChallenge
          attempt={active}
          turn={turn}
          offset={0}
          disabled={false}
          finish={async () => {
            setActive(null);
            setTurn(turn + 1);
          }}
        />
      ) : (
        <>
          <VenueTabs
            selected={selected}
            onSelect={(venue) => {
              setSelected(venue);
              setTurn(0);
            }}
          />
          <ChallengeDeck
            key={selected}
            cards={ordered}
            venue={selected}
            label={venues.find((v) => v.id === selected)!.label}
            turn={turn}
            onAction={async (direction) => {
              if (direction === -1) {
                setTurn(turn + 1);
                return turn + 1;
              }
              const started = Date.now();
              setActive({
                id: 'preview',
                status: 'active',
                card: {
                  ...ordered[0]!,
                  challengeId: 'preview',
                  revisionId: 'preview',
                  levelId: 'level-1',
                  venue: selected,
                  durationSeconds: 300,
                },
                startedAt: new Date(started).toISOString(),
                deadlineAt: new Date(started + 300_000).toISOString(),
                endedAt: null,
                elapsedSeconds: null,
                completionDate: null,
                timeZone: null,
              });
            }}
          />
        </>
      )}
    </ChallengeLayout>
  );
}
