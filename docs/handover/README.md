# ProcureDesk Platform — Handover Documentation Set

This folder contains the enterprise handover documentation for the ProcureDesk Platform, intended for production handover, management review, engineering onboarding, audit readiness, operations support, and future scalability planning.

| # | Document | Audience |
|---|----------|----------|
| 1 | [Executive Project Overview](./01-executive-project-overview.md) | CTO, Engineering Leadership, Product, Operations |
| 2 | [Complete System Architecture](./02-system-architecture.md) | Principal Engineers, Architects, Tech Leads |
| 3 | [DevOps, Infrastructure & Deployment](./03-devops-infrastructure-deployment.md) | SRE, DevOps, Release Managers, On-call |
| 4 | [Engineering Handover & Operations](./04-engineering-handover-operations.md) | Incoming engineering & operations teams |
| 5 | [API & Integration Documentation](./05-api-and-integration.md) | Backend, integrators, frontend consumers |
| 6 | [Security & Compliance](./06-security-and-compliance.md) | Security Lead, CISO office, Audit |
| 7 | [Performance & Scalability Assessment](./07-performance-and-scalability.md) | Architects, SRE, Capacity Planning |

These documents are **derived from the actual implementation** in this repository (NestJS API on Fastify, React 19 + Vite SPA, BullMQ worker, PostgreSQL 16 with RLS, Redis 7, Azure Blob, Microsoft Graph). They complement — not replace — the existing numbered docs at `docs/01-…` through `docs/08-…` and the architecture/operations/product folders.
