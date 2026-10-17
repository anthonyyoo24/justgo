# Future AI text coach proposal

**Status:** Deferred. [Phase 14](../implementation-plan/phase-14-future-text-coach.md)
owns approval and acceptance. No coach dependencies, tables, API routes, provider
configuration or UI are implemented. Revalidate streaming APIs and provider
privacy/retention behavior when scheduling the work.

## Planned persistence

| Table                 | Main fields                                                                                                                                                                               | Relationship/rule                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `coach_conversations` | `id`, `user_id`, created/updated timestamps, status                                                                                                                                       | User-owned conversation; paginated history and authenticated deletion                                                       |
| `coach_messages`      | `id`, `conversation_id`, `user_id`, role, body, sequence, created timestamp, response status                                                                                              | Enforce parent/owner consistency and unique conversation sequence; distinguish complete, interrupted, and failed responses  |
| `coach_requests`      | `id`, `user_id`, `conversation_id`, client request key, user/assistant message IDs, status, expiry, provider request ID, prompt/context-policy version, model, usage/reservation metadata | Unique user/request key; reject reuse with a different payload; track concurrent work, actual usage, and uncertain outcomes |

Keep conversation history in separate rows, not one growing JSON array. Index owner/conversation access and message pagination when coaching is built. Define account-owned context choices when the feature is implemented; the proposed receipt store must not be mistaken for an existing table. Raw prompts and reflection text do not belong in usage logs. These are planned models, not initial migrations.

## Request, context and provider boundaries

The coach is a planned text conversation feature in the existing API, not part of the initial product build. Reflection dictation is a separate input feature. Keep identity, billing/access checks, data access, and usage-policy boundaries reusable now; implement coaching tables, endpoints, UI, and provider integration when the feature is scheduled. No separate backend, voice infrastructure, vector database, or agent framework is required initially.

### Request and response flow

1. The app sends a message, conversation ID, and unique request key to the authenticated coach endpoint. The backend derives the user from the session and validates conversation ownership, input bounds, coaching access, and usage allowance.
2. In a short transaction, save the user's message and reserve the request/usage budget. Start with one active generation per conversation; coordinate limits in shared durable storage, not per-instance memory. Repeated requests with the same key reuse the existing status/result instead of creating another generation.
3. Select a bounded conversation history and permitted product context through ordinary user-scoped queries. End the database transaction before contacting the AI provider. Provider credentials and model/instruction configuration stay on the backend.
4. Stream text and typed status events over HTTPS to the app. Use `expo/fetch` to consume the stream and validate framing, incremental UTF-8 decoding, authentication, cancellation, and network interruption on real iOS/Android builds. WebSockets are not necessary for text replies. [Expo streaming fetch](https://docs.expo.dev/versions/latest/sdk/expo/).
5. Save the final assistant message and usage outcome before reporting successful completion. In-progress text is provisional. On a disconnect or timeout, reload request status and saved messages; never present a partial reply as complete. Abort upstream work when possible. An expired generation with an unknown provider outcome must not silently start another potentially billable request; reconcile usage conservatively and expose an explicit retry path.

Keep normal responses within a bounded request duration and token budget. A queue is not needed for ordinary replies. If optional conversation summarization later requires asynchronous execution, evaluate that as a separate job requirement.

### Selecting personal context

| Context                           | Initial retrieval approach                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Conversation so far               | A bounded window of this conversation's saved messages                                                  |
| Challenge history                 | Recent attempts joined to stable challenges/current wording and any separately implemented categories   |
| Completion counts and progression | Defined time-window aggregates and current progression records                                          |
| Reflections and feelings          | A limited set of permitted saved reflections/feedback tied to relevant attempts; exclude unsaved drafts |

Provide an explicit choice before sharing reflection or activity history with the AI provider, separate from analytics consent. If declined, the coach can use only the current conversation. Check the current choice on every request, including any derived summaries, and apply account/record deletion rules to cached context. Provider data retention must be reviewed and disclosed when the provider is selected.

The server decides which records may be retrieved. The model does not receive database credentials or unrestricted SQL access. Treat journal text and prior messages as user content, not instructions that can override access controls. Any future model-requested data lookup must use allowlisted server functions with the same ownership/permission checks. Bound context by recency, relevance, size, and token budget; do not send the entire journal with each message.

SQL queries cover the initial context needs. Consider semantic search only if real retrieval needs exceed recent/history/category queries; no vector database is selected now.

### Provider selection and limits

Choose the model/provider during the coaching phase by evaluating response quality with representative challenge/reflection scenarios, streaming latency, failure behavior, privacy/retention controls, and cost. Keep the integration behind a narrow server adapter; hosting on Vercel does not select the AI provider.

Track per-user allowances, concurrent requests, token usage, and overall spend without logging message bodies or retrieved reflections. Define server-enforced limits, provider timeouts, and a feature disable switch before release. Token reservations and unknown outcomes need expiry/reconciliation rules. Evaluate factual use of supplied context, handling of missing history, prompt injection, and appropriate coaching boundaries before enabling the feature.
