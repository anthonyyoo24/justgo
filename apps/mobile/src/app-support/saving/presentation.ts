import type {
  JournalState,
  Operation,
  WarningEpisode,
} from '../../data/activity/model';

export function savingRiskCopy(warning: WarningEpisode): string {
  const cause =
    !warning.online && warning.storageFull
      ? 'Your phone is offline and storage is full.'
      : warning.storageFull
        ? 'Your phone’s storage is full.'
        : !warning.online
          ? 'Your phone is offline and we can’t save new activity on it.'
          : 'We can’t save your new activity right now.';
  return `${cause} New activity could be lost if the app closes before it's saved.`;
}
export function operationProblem(operation: Operation) {
  if (operation.state === 'auth')
    return 'Reconnect your account to upload this saved activity.';
  if (operation.kind === 'patch' && operation.code === 'INVALID_REQUEST')
    return 'This reflection request wasn’t accepted. Your writing and completion are retained. No field-specific reason was supplied.';
  if (operation.code === 'ACCESS_REQUIRED')
    return 'This completion’s subscription coverage couldn’t be verified. The entry is retained, but it doesn’t count toward Progress.';
  if (operation.code === 'NOT_FOUND')
    return 'The server couldn’t find the record needed to upload this entry. Its submitted content is retained on this phone.';
  return 'This entry couldn’t upload because its request wasn’t accepted. Its submitted content is retained. Repeating the same request won’t fix it.';
}
export function actionableOperations(state: JournalState) {
  return state.journal.operations.filter(
    (operation) => operation.state === 'rejected' || operation.state === 'auth',
  );
}
