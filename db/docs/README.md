# Database Documentation

ProcureDesk is PostgreSQL-first. Production schema design must follow the main rebuild plan:

- tenant-aware data model
- schemas by domain
- `numeric(18,2)` for money
- `timestamptz` for operational timestamps
- `date` for business milestone dates
- `deleted_at` instead of boolean deletion flags
- audit and outbox tables for operational traceability

Migrations will be added during the database foundation phase.

