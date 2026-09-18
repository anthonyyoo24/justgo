# Frontend architecture checklist

Technical topics from the PDF's system design section, compared with [TECH_STACK.md](TECH_STACK.md). Updated September 15, 2026.

“Represented” means included in the plan, not implemented. Related concepts are grouped; partly covered areas appear again where clarification is needed.

## 1. Already represented

| Concepts                                             | Where they fit in our plan                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Architecture, dependencies, data models, data flow   | Mobile app, API, database, and provider responsibilities.                                               |
| Client/server boundaries and communication           | Authenticated HTTP API; server controls access and saved progress.                                      |
| Local/shared state, source of truth, synchronization | React, Zustand, TanStack Query, and PostgreSQL have defined roles.                                      |
| Routing and separation of concerns                   | Expo Router, feature modules, and native adapters.                                                      |
| Caching, revalidation, pagination                    | In-memory queries, foreground refresh, and paginated history; policies need detail.                     |
| API failures, retries/backoff, reliability, recovery | Safe action retries, failed-save states, and billing recovery.                                          |
| Offline support and degraded experiences             | Loaded timers continue; saves require connectivity; unsaved typed reflections remain visible for retry. |
| Accessibility and native compatibility               | Screen readers, gesture alternatives, reduced motion, and device testing.                               |
| Performance, scale, bottlenecks                      | Card prefetching, smooth gestures, and backend capacity testing.                                        |
| Monitoring, logging, telemetry                       | Sentry, PostHog, request IDs, and alerts.                                                               |
| Streaming, feature switches, experiments             | Coach streaming and optional-feature switches are planned; experiments are mentioned.                   |

## 2. What we should add or clarify

| Concepts                                                                               | What to specify                                                                                    | When                               |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Component hierarchy, boundaries, routing, React Context                                | Responsibilities of screens, components, hooks, API client, and route gates.                       | Before the first connected screens |
| REST/API conventions and frontend resilience                                           | Request/error shapes, timeouts, safe mobile retries/backoff, and stale-response handling.          | Before the first connected screens |
| State, caching, revalidation, optimistic updates                                       | Cache keys/freshness, refresh triggers, derived state, and which actions require confirmation.     | Before the first connected screens |
| Partial rendering; error, empty, loading states                                        | Let independent sections fail/load separately; define render-error boundaries and useful feedback. | As each screen is built            |
| Pagination, virtualization, filters                                                    | Cursor/page rules, filter-scoped requests, and rendering a limited window of long lists.           | When building history              |
| Critical startup path, lazy initialization, unnecessary renders, perceived performance | Measure native startup/responsiveness; use appropriate skeletons and loading feedback.             | During development                 |
| Accessibility details, i18n/L10n, visual regression                                    | Large-text checks, organized strings, locale formats, and screenshot comparisons.                  | During development                 |
| Flags/kill switches, A/B experiments, client metrics, tracing                          | Safe defaults, useful measurements, and tracing actions into API requests.                         | Before relevant feature releases   |

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

**Can we start? Yes.** The stack is sufficient. Agree on the first three shared conventions before connecting screens to the API. The remaining details can be specified alongside their features; they do not require a complete architecture redesign.
