import { randomUUID } from 'expo-crypto';
import {
  reflectionResponseSchema,
  type FeelingCode,
  type ReflectionResponse,
} from '@justgo/contracts';
import { ApiError } from '../../lib/http';
import type { AccountClient } from '../../lib/account-client';

type Form = { feeling: FeelingCode | null; text: string };
type Mutation = Readonly<{
  actionId: string;
  expectedRevision: number;
  feeling: FeelingCode | null;
  text: string | null;
}>;
type SkipMutation = Readonly<{ actionId: string; expectedRevision: number }>;

export type ReflectionSnapshot = Form & {
  phase: 'loading' | 'ready' | 'load-error' | 'already';
  revision: number;
  status: ReflectionResponse['status'];
  saving: boolean;
  draftError: boolean;
  conflict: boolean;
  terminalConflict: boolean;
  dismissOpen: boolean;
  error: string | null;
  pendingAction: 'final' | 'skip' | null;
};

const empty: Form = { feeling: null, text: '' };
const sameForm = (a: Form, b: Form) =>
  a.feeling === b.feeling && payloadText(a.text) === payloadText(b.text);
const hasInput = (form: Form) =>
  form.feeling !== null || form.text.trim().length > 0;
const payloadText = (text: string) => (text.trim() ? text : null);
const pathFor = (attemptId: string) =>
  `/v1/reflections/${encodeURIComponent(attemptId)}`;
const isConflict = (error: unknown) =>
  error instanceof ApiError && error.code === 'CONFLICT';

export class ReflectionController {
  private readonly id: () => string;
  private readonly listeners = new Set<() => void>();
  private readonly abort = new AbortController();
  private alive = true;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private draftInFlight: Promise<boolean> | null = null;
  private draftRetry: Mutation | null = null;
  private finalRetry: {
    kind: 'final' | 'skip';
    body: Mutation | SkipMutation;
  } | null = null;
  private saved: Form = empty;
  private snapshot: ReflectionSnapshot = {
    ...empty,
    phase: 'loading',
    revision: 0,
    status: 'none',
    saving: false,
    draftError: false,
    conflict: false,
    terminalConflict: false,
    dismissOpen: false,
    error: null,
    pendingAction: null,
  };

  constructor(
    private readonly client: Pick<AccountClient, 'request'>,
    private readonly attemptId: string,
    private readonly onFinished: () => void,
    options: { id?: () => string; fresh?: boolean } = {},
  ) {
    this.id = options.id ?? randomUUID;
    if (options.fresh) this.snapshot = { ...this.snapshot, phase: 'ready' };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.snapshot;
  private publish(update: Partial<ReflectionSnapshot>) {
    if (!this.alive) return;
    this.snapshot = { ...this.snapshot, ...update };
    this.listeners.forEach((listener) => listener());
  }
  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  dispose() {
    this.alive = false;
    this.clearTimer();
    this.abort.abort();
    this.listeners.clear();
  }

  async load() {
    this.publish({ phase: 'loading', error: null });
    try {
      const response = await this.client.request(
        pathFor(this.attemptId),
        reflectionResponseSchema,
        { signal: this.abort.signal },
      );
      this.acceptLoaded(response);
    } catch {
      this.publish({
        phase: 'load-error',
        error: 'Couldn’t load this reflection. Try again.',
      });
    }
  }
  private acceptLoaded(response: ReflectionResponse) {
    const form = { feeling: response.feeling, text: response.text ?? '' };
    this.saved = form;
    this.draftRetry = null;
    this.finalRetry = null;
    this.publish({
      ...form,
      phase:
        response.status === 'submitted' || response.status === 'skipped'
          ? 'already'
          : 'ready',
      revision: response.revision,
      status: response.status,
      draftError: false,
      conflict: false,
      terminalConflict: false,
      dismissOpen: false,
      pendingAction: null,
      error: null,
    });
  }
  private scheduleDraft() {
    this.clearTimer();
    if (this.snapshot.saving || this.snapshot.conflict || this.finalRetry)
      return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.saveDraft();
    }, 700);
  }
  setFeeling(feeling: FeelingCode | null) {
    if (
      this.snapshot.phase !== 'ready' ||
      this.snapshot.saving ||
      this.finalRetry ||
      this.snapshot.conflict
    )
      return;
    this.publish({ feeling, error: null });
    this.scheduleDraft();
  }
  setText(text: string) {
    if (
      this.snapshot.phase !== 'ready' ||
      this.snapshot.saving ||
      this.finalRetry ||
      this.snapshot.conflict
    )
      return;
    this.publish({ text, error: null });
    this.scheduleDraft();
  }
  private async saveDraft(): Promise<boolean> {
    if (this.draftInFlight) return this.draftInFlight;
    if (
      this.snapshot.phase !== 'ready' ||
      this.snapshot.conflict ||
      this.finalRetry
    )
      return false;
    if (!this.draftRetry && sameForm(this.snapshot, this.saved)) return true;
    const action =
      this.draftRetry ??
      Object.freeze({
        actionId: this.id(),
        expectedRevision: this.snapshot.revision,
        feeling: this.snapshot.feeling,
        text: payloadText(this.snapshot.text),
      });
    this.draftRetry = action;
    const work = (async () => {
      try {
        const response = await this.client.request(
          `${pathFor(this.attemptId)}/draft`,
          reflectionResponseSchema,
          { body: action, signal: this.abort.signal },
        );
        this.draftRetry = null;
        this.saved = { feeling: action.feeling, text: action.text ?? '' };
        this.publish({
          revision: response.revision,
          status: response.status,
          draftError: false,
          error: null,
        });
        if (!sameForm(this.snapshot, this.saved)) this.scheduleDraft();
        return true;
      } catch (error) {
        if (isConflict(error)) {
          this.clearTimer();
          this.publish({
            conflict: true,
            error:
              'This reflection changed on another device. Choose which version to keep.',
          });
        } else {
          this.publish({ draftError: true });
        }
        return false;
      } finally {
        this.draftInFlight = null;
      }
    })();
    this.draftInFlight = work;
    return work;
  }
  retryDraft = () => this.saveDraft();
  close = () => {
    if (
      this.snapshot.phase !== 'ready' ||
      this.snapshot.saving ||
      this.finalRetry ||
      this.snapshot.conflict
    )
      return;
    if (hasInput(this.snapshot)) this.publish({ dismissOpen: true });
    else return this.finish('skip');
  };
  keepEditing = () => this.publish({ dismissOpen: false });
  discard = () => {
    this.publish({ dismissOpen: false });
    return this.finish('skip');
  };
  submit = () => {
    this.publish({ dismissOpen: false });
    return this.finish(
      this.finalRetry?.kind ?? (hasInput(this.snapshot) ? 'final' : 'skip'),
    );
  };
  private async finish(kind: 'final' | 'skip'): Promise<boolean> {
    if (
      this.snapshot.phase !== 'ready' ||
      this.snapshot.saving ||
      this.snapshot.conflict
    )
      return false;
    this.clearTimer();
    this.publish({
      saving: true,
      pendingAction: this.finalRetry?.kind ?? kind,
      error: null,
    });
    if (this.draftInFlight) await this.draftInFlight;
    if (this.draftRetry) {
      const resolved = await this.saveDraft();
      if (!resolved) {
        this.publish({
          saving: false,
          pendingAction: null,
          error:
            'Your draft has not saved yet. Retry the draft, then try again.',
        });
        return false;
      }
    }
    if (this.snapshot.conflict) {
      this.publish({ saving: false, pendingAction: null });
      return false;
    }
    if (!this.finalRetry) {
      const body =
        kind === 'final'
          ? Object.freeze({
              actionId: this.id(),
              expectedRevision: this.snapshot.revision,
              feeling: this.snapshot.feeling,
              text: payloadText(this.snapshot.text),
            })
          : Object.freeze({
              actionId: this.id(),
              expectedRevision: this.snapshot.revision,
            });
      this.finalRetry = { kind, body };
    }
    const action = this.finalRetry;
    try {
      await this.client.request(
        `${pathFor(this.attemptId)}/${action.kind}`,
        reflectionResponseSchema,
        { body: action.body, signal: this.abort.signal },
      );
      this.finalRetry = null;
      // Keep the saving view mounted until navigation finishes.
      // Publishing "already" here briefly renders the fallback page first.
      if (this.alive) this.onFinished();
      return true;
    } catch (error) {
      if (isConflict(error)) {
        this.finalRetry = null;
        this.publish({
          conflict: true,
          pendingAction: null,
          error:
            'This reflection changed on another device. Choose which version to keep.',
        });
      } else {
        this.publish({
          error:
            action.kind === 'skip'
              ? 'Couldn’t skip. Retry to leave safely.'
              : 'Couldn’t save. Your reflection is still here. Retry save.',
        });
      }
      this.publish({ saving: false });
      return false;
    }
  }
  private async latest() {
    return this.client.request(
      pathFor(this.attemptId),
      reflectionResponseSchema,
      { signal: this.abort.signal },
    );
  }
  useLatest = async () => {
    try {
      const response = await this.latest();
      this.acceptLoaded(response);
      if (this.snapshot.phase === 'already') this.onFinished();
    } catch {
      this.publish({ error: 'Couldn’t load the saved version. Try again.' });
    }
  };
  keepMine = async () => {
    const local = { feeling: this.snapshot.feeling, text: this.snapshot.text };
    try {
      const response = await this.latest();
      if (response.status === 'submitted' || response.status === 'skipped') {
        this.publish({
          terminalConflict: true,
          error:
            'This reflection was finished on another device. Your unsaved edits are still visible here.',
        });
        return;
      }
      this.draftRetry = null;
      this.saved = { feeling: response.feeling, text: response.text ?? '' };
      this.publish({
        ...local,
        revision: response.revision,
        status: response.status,
        conflict: false,
        terminalConflict: false,
        draftError: false,
        error: null,
      });
      this.scheduleDraft();
    } catch {
      this.publish({ error: 'Couldn’t check the latest version. Try again.' });
    }
  };
}
