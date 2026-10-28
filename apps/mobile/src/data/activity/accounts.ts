import { AccountRepository } from './repository';

// One active identity; parked accounts keep their memory-only submissions for
// recovery while the process survives. No account-switcher UI is introduced.
export class AccountRepositories {
  private readonly accounts = new Map<string, AccountRepository>();
  private current: AccountRepository | null = null;
  constructor(
    private readonly create: (accountId: string) => AccountRepository,
  ) {}
  get(accountId: string): AccountRepository {
    let account = this.accounts.get(accountId);
    if (!account) {
      account = this.create(accountId);
      this.accounts.set(accountId, account);
    }
    return account;
  }
  activate(
    accountId: string | null,
    environment: { active: boolean; online: boolean },
  ): AccountRepository | null {
    if (this.current?.accountId !== accountId) {
      this.current?.setAccountCurrent(false);
      this.current?.setEnvironment({ active: false, online: false });
      this.current = accountId ? this.get(accountId) : null;
      if (this.current) this.accounts.set(this.current.accountId, this.current);
    }
    this.current?.setAccountCurrent(true);
    this.current?.setEnvironment(environment);
    return this.current;
  }
  dispose(): void {
    for (const account of this.accounts.values()) account.dispose();
    this.accounts.clear();
    this.current = null;
  }
  async erase(accountId: string): Promise<void> {
    const account = this.accounts.get(accountId) ?? this.create(accountId);
    if (this.current === account) this.current = null;
    // Retain failed cleanups for retry; never reactivate a disposed repository.
    this.accounts.set(accountId, account);
    await account.erase();
    this.accounts.delete(accountId);
  }
}
