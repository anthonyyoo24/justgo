import { useState } from 'react';
import { venues, type Venue } from '@justgo/contracts';
import type { ChallengeStart } from '../../../features/challenges/controller';
import { ChallengeLayout } from '../../../features/challenges/ChallengeLayout';
import { ChallengeDeck } from '../../../features/challenges/deck/ChallengeDeck';
import { ActiveChallenge } from '../../../features/challenges/active/ActiveChallenge';
import { VenueTabs } from '../../../features/challenges/deck/VenueTabs';
import { previewCardsForVenue } from './preview-copy';
export function DeckPreview({
  insetTop = true,
  onCompleted,
}: {
  insetTop?: boolean;
  onCompleted: () => void;
}) {
  const [selected, setSelected] = useState<Venue>('cafe');
  const [turn, setTurn] = useState(0);
  const [active, setActive] = useState<ChallengeStart | null>(null);
  const cards = previewCardsForVenue(selected);
  const offset = turn % cards.length;
  const ordered = [...cards.slice(offset), ...cards.slice(0, offset)];
  return (
    <ChallengeLayout
      title={active ? 'Active challenge' : 'Find a challenge'}
      insetTop={insetTop}
      fillContent={!active}
      showSettings={!active}
    >
      {active ? (
        <ActiveChallenge
          attempt={active}
          turn={turn}
          disabled={false}
          finish={async (outcome) => {
            setActive(null);
            setTurn((current) => current + 1);
            if (outcome === 'completed') onCompleted();
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
                card: {
                  ...ordered[0]!,
                  challengeId: 'preview',
                  position: 0,
                  subtext: null,
                  levelId: 'level-1',
                  venue: selected,
                  durationSeconds: 300,
                },
                startedAt: new Date(started).toISOString(),
                startTimeZone: 'America/Toronto',
                turn,
              });
            }}
          />
        </>
      )}
    </ChallengeLayout>
  );
}
