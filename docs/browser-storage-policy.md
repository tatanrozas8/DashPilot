# Browser Storage Policy

DashPilot treats browser storage as an unsafe persistence layer for enterprise data.

Allowed persistent browser state:

- Active project, dataset, dashboard and presentation IDs.
- Sync status, execution mode, correlation ID and non-sensitive status text.
- Visual preferences such as presentation options, share form defaults, saved dashboard themes and panel visibility.
- Expiration metadata for the persisted store.

Prohibited persistent browser state:

- Raw dataset rows.
- Workbook sheets, previews and samples.
- Dataset profiles with sample values or business-sensitive column metadata.
- Full dashboard, presentation or provider specs.
- Copilot prompts, chat messages and provider responses.
- Share tokens, Supabase secrets or service-role keys.

Local/demo sandbox:

- When Supabase is not configured or the user is not authenticated, DashPilot runs as an explicit local sandbox.
- Dataset rows, parsed files and generated specs are kept in memory for the current browser session only.
- Reloading the page may lose local sandbox data by design.
- IndexedDB is not used as secure enterprise storage. Any future IndexedDB cache must be opt-in, sandbox-only, expiring and clearly labeled as unsafe for enterprise persistence.

Retention and purge:

- The Zustand persisted store expires after 30 days.
- Legacy keys such as `dashpilot:dataset:*`, `dashpilot:dashboard:*`, `dashpilot:presentation:*`, `dashpilot:share:*` and the old raw outbox key are purged during migration and logout.
- Logout and Supabase user changes clear the persisted DashPilot store and in-memory workspace state.
