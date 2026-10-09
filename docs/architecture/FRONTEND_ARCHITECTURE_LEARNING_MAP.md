# Frontend architecture checklist

Technical topics from the PDF's system design section, compared with [TECH_STACK.md](TECH_STACK.md). Updated October 8, 2026.

“Represented” means included in the plan, not implemented. Related concepts are grouped; partly covered areas appear again where clarification is needed.

**Implemented structure checkpoint — Phase 07:** User-facing Challenges, Reflections and Progress stay under `features/`. Their shared saving/cached-data/upload system lives under `apps/mobile/src/data/activity/`. App providers/foreground coordination and the startup access gate live in `app-support/providers/` and `app-support/access/`; account/recovery UI and session/Keychain support live in `app-support/identity/`; developer screen fixtures live in `dev/previews/`. Foundation and unused Shell placeholders are retired. Features may use data and app-support provider hooks; data may use shared infrastructure/contracts but cannot import routes, app-support, developer code, features, components or theme. Shared components/lib/theme/platform cannot import routes, app-support, developer code, data or features. Only the guarded preview route loads developer code from production source. These directions are enforced by ESLint and boundary tests; see [coding rules](../../AGENTS.md#enforced-code-boundaries), [app folder responsibilities](APP_SHELL.md#implemented-folder-responsibilities) and the [07.2 handoff](../handoffs/phase-07-2-local-sync.md). Screen/lifecycle integration and Progress composition are implemented. React owns unfinished activity/editor drafts; Zustand exposes browsing and repository live state, AsyncStorage stores the catalog/journal envelope, and TanStack owns independent server reads. Native/device/hosted results remain distinct acceptance evidence in the handoffs.

## 1. Already represented

| Concepts                                             | Where they fit in our plan                                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Architecture, dependencies, data models, data flow   | Mobile app, API, database, and provider responsibilities.                                                                |
| Client/server boundaries and communication           | Authenticated HTTP API; server controls access and saved progress.                                                       |
| Local/shared state, source of truth, synchronization | React, Zustand, AsyncStorage journal, TanStack Query and PostgreSQL have distinct implemented roles.                     |
| Routing and separation of concerns                   | Expo Router, user-facing feature modules, shared activity data and native adapters.                                      |
| Caching, revalidation, pagination                    | Durable catalog/latest summary/current month/today; older online pages; fenced independent reads and start-time cursors. |
| API failures, retries/backoff, reliability, recovery | Stable completion/PATCH replay, ordered bounded/sparse retries, memory-only recovery and planned billing recovery.       |
| Offline support and degraded experiences             | Downloaded challenges support phone-saved completion/reflection offline; unavailable history reads require connection.   |
| Accessibility and native compatibility               | Screen readers, gesture alternatives, reduced motion, and device testing.                                                |
| Performance, scale, bottlenecks                      | Card prefetching, smooth gestures, and backend capacity testing.                                                         |
| Monitoring, logging, telemetry                       | Sentry, PostHog, request IDs, and alerts.                                                                                |
| Streaming, feature switches, experiments             | Coach streaming and optional-feature switches are planned; experiments are mentioned.                                    |

## 2. What we should add or clarify

| Concepts                                                                               | What to specify                                                                                                          | When                               |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| Component hierarchy, boundaries, routing, React Context                                | Implemented feature/data/app-support/shared boundaries; preserve them as responsibilities grow.                          | Maintaining implemented boundaries |
| REST/API conventions and frontend resilience                                           | Implemented resource/error contracts, retry ownership and account/generation fences; extend with billing in 07A.         | Maintaining implemented boundaries |
| State, caching, revalidation, optimistic updates                                       | Implemented phone-first save/fallback, independent aggregate coverage and rollover/pruning; connect saved access in 07A. | Maintaining implemented boundaries |
| Partial rendering; error, empty, loading states                                        | Let independent sections fail/load separately; define render-error boundaries and useful feedback.                       | As each screen is built            |
| Pagination, virtualization, filters                                                    | Cursor/page rules, filter-scoped requests, and rendering a limited window of long lists.                                 | When building history              |
| Critical startup path, lazy initialization, unnecessary renders, perceived performance | Measure native startup/responsiveness; use appropriate skeletons and loading feedback.                                   | During development                 |
| Accessibility details, i18n/L10n, visual regression                                    | Large-text checks, organized strings, locale formats, and screenshot comparisons.                                        | During development                 |
| Flags/kill switches, A/B experiments, client metrics, tracing                          | Safe defaults, useful measurements, and tracing actions into API requests.                                               | Before relevant feature releases   |

## 3. Concepts not included in the current build

| Concepts                                                                         | Recommendation                                                                 |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Browser CSR, SSR, SSG, hybrid rendering, HTML hydration                          | Learn in a small web project; native rendering works differently.              |
| SEO, browser compatibility, HTML/CSS rendering path, web progressive enhancement | Learn separately for web roles.                                                |
| Core Web Vitals: LCP, INP, CLS; FCP and historical TTI                           | Learn browser metrics separately; use native measurements in JustGO.           |
| Web bundle splitting / on-demand feature bundles                                 | Learn separately; different from delaying native initialization.               |
| Redux                                                                            | Learn the concepts; our chosen state tools are sufficient.                     |
| WebSockets, continuous polling, long polling                                     | Study the alternatives; add only if a feature needs live updates.              |
| CDN and HTTP/asset delivery caching                                              | Specify when introducing remote assets; no new service needed for bundled art. |
| Edge tracing/logging                                                             | Learn separately; our API currently uses Node hosting.                         |
| Personalized recommendations                                                     | Consider only if the product needs them later.                                 |

The shared conventions and Phase 07 data/flow boundaries are implemented. The remaining work is measured native/device performance/accessibility acceptance, Phase 07A verified billing and later privacy/release gates; no broader offline engine or architecture redesign is required.
