import { randomUUID } from 'expo-crypto';
import { normalizeReflectionText, type FeelingCode } from '@justgo/contracts';
import type { AccountRepository } from '../../data/activity/repository';

type Form = { feeling: FeelingCode | null; text: string };
export type ReflectionSnapshot = Form & {
  phase: 'ready' | 'missing';
  editing: boolean;
  submitting: boolean;
  dismissOpen: boolean;
  error: string | null;
};
const normalizedText = normalizeReflectionText;
const same = (a: Form, b: Form) =>
  a.feeling === b.feeling && normalizedText(a.text) === normalizedText(b.text);

/** React-form state only: explicit submissions enter the account repository. */
export class ReflectionController {
  private listeners = new Set<() => void>();
  private alive = true;
  private finished = false;
  private snapshot: ReflectionSnapshot;
  private saved: Form;
  private pending: Promise<void> | undefined;
  private submittedIdentity: { id: string; form: Form } | undefined;
  private unsubscribe: (() => void) | undefined;
  constructor(
    private readonly repository: Pick<
      AccountRepository,
      'getAttempt' | 'submitReflection' | 'store'
    >,
    private readonly attemptId: string,
    private readonly onFinished: () => void,
    private readonly options: {
      id?: () => string;
      isCurrent?: () => boolean;
    } = {},
  ) {
    const attempt = repository.getAttempt(attemptId);
    this.saved = {
      feeling: attempt?.reflection?.feeling ?? null,
      text: attempt?.reflection?.text ?? '',
    };
    this.snapshot = {
      ...this.saved,
      phase: attempt ? 'ready' : 'missing',
      editing: !!attempt?.reflection,
      submitting: false,
      dismissOpen: false,
      error: this.rejectedReflection()
        ? 'This reflection request wasn’t accepted. Your submitted writing is retained.'
        : null,
    };
  }
  private rejectedReflection() {
    return this.repository.store
      .getState()
      .journal.operations.find(
        (operation) =>
          operation.attemptId === this.attemptId &&
          operation.kind === 'patch' &&
          operation.state === 'rejected' &&
          operation.code === 'INVALID_REQUEST',
      );
  }
  connect() {
    if (this.unsubscribe || !this.alive) return;
    this.unsubscribe = this.repository.store.subscribe(() => {
      const latest = this.repository.getAttempt(this.attemptId);
      if (!latest || this.snapshot.submitting) return;
      const form = {
        feeling: latest.reflection?.feeling ?? null,
        text: latest.reflection?.text ?? '',
      };
      const untouched = same(this.snapshot, this.saved);
      this.saved = form;
      if (untouched) this.update({ ...form, editing: !!latest.reflection });
      else if (latest.reflection)
        this.update({ editing: true, feeling: latest.reflection.feeling });
    });
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.snapshot;
  private update(value: Partial<ReflectionSnapshot>) {
    if (!this.alive) return;
    this.snapshot = { ...this.snapshot, ...value };
    this.listeners.forEach((listener) => listener());
  }
  setFeeling = (feeling: FeelingCode | null) => {
    if (
      this.snapshot.editing ||
      this.snapshot.submitting ||
      this.snapshot.phase !== 'ready'
    )
      return;
    this.update({ feeling, error: null });
  };
  setText = (text: string) => {
    if (this.snapshot.phase === 'ready') this.update({ text, error: null });
  };
  private finish() {
    if (!this.alive || this.finished || this.options.isCurrent?.() === false)
      return;
    this.finished = true;
    this.onFinished();
  }
  close = () => {
    if (this.snapshot.submitting) return;
    if (same(this.snapshot, this.saved)) this.finish();
    else this.update({ dismissOpen: true });
  };
  keepEditing = () => this.update({ dismissOpen: false });
  discard = () => {
    if (!this.snapshot.submitting) this.finish();
  };
  submit = (): Promise<void> => {
    if (this.pending) return this.pending;
    if (
      this.snapshot.phase !== 'ready' ||
      !this.alive ||
      this.finished ||
      this.options.isCurrent?.() === false
    )
      return Promise.resolve();
    const submitted: Form = {
      feeling: this.snapshot.feeling,
      text: this.snapshot.text,
    };
    if (same(submitted, this.saved)) {
      if (this.rejectedReflection()) {
        this.update({
          error:
            'This reflection request was rejected. Your writing is retained; an unchanged submission cannot be retried.',
        });
        return Promise.resolve();
      }
      this.finish();
      return Promise.resolve();
    }
    if (submitted.text.length > 10000) {
      this.update({
        error: 'Keep your reflection to 10,000 characters or fewer.',
      });
      return Promise.resolve();
    }
    if (!submitted.feeling && !normalizedText(submitted.text)) {
      if (!this.snapshot.editing) this.finish();
      else this.update({ error: 'Add some text to keep this reflection.' });
      return Promise.resolve();
    }
    const submissionId =
      this.submittedIdentity && same(submitted, this.submittedIdentity.form)
        ? this.submittedIdentity.id
        : (this.options.id ?? randomUUID)();
    this.submittedIdentity = { id: submissionId, form: submitted };
    const patch = this.snapshot.editing
      ? { text: normalizedText(submitted.text) }
      : { feeling: submitted.feeling, text: normalizedText(submitted.text) };
    this.update({ submitting: true, error: null });
    this.pending = (async () => {
      try {
        await this.repository.submitReflection(
          this.attemptId,
          submissionId,
          patch,
        );
        if (!this.alive || this.options.isCurrent?.() === false) return;
        this.submittedIdentity = undefined;
        const latest = this.repository.getAttempt(this.attemptId)?.reflection;
        this.saved = {
          feeling: latest?.feeling ?? null,
          text: latest?.text ?? '',
        };
        // Typing can continue during a slow phone write. Never navigate away from newer input.
        if (same(this.snapshot, submitted)) this.finish();
        else
          this.update({
            editing: !!latest,
            feeling: this.saved.feeling,
            dismissOpen: false,
          });
      } catch {
        if (this.alive)
          this.update({ error: 'Check your reflection and try saving again.' });
      } finally {
        this.pending = undefined;
        this.update({ submitting: false });
      }
    })();
    return this.pending;
  };
  dispose() {
    this.alive = false;
    this.unsubscribe?.();
    this.listeners.clear();
  }
}
