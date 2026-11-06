Before changing Expo, React Native or native code, read the docs for the `expo` version in `apps/mobile/package.json` (`docs.expo.dev/versions/v<major>.0.0/`), because your training data may describe an older SDK.

App imports omit the file extension, so Metro can pick the native or web adapter. The source `tsconfig.json` sees only React, React Native and Expo types. Jest globals and Node APIs stay in `tsconfig.tests.json`.

SDK 58 web stacks keep inactive screens in the DOM. Assert the active screen through role and name queries, not text.

Provider tests mount the real provider, controller and client with controllable vault, `fetch` and AppState, and fake timers for expiry and polling. Before restoring real timers, unmount, cancel, clear and flush queued callbacks, and drain TanStack notification timers inside an async `act`. Account-switch tests await the old account's refresh before replacing its transport fixture, observe the new account's request before resolving it, and assert distinct totals. Do not add waits to hide a race.
