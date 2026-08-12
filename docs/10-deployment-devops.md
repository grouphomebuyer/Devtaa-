# Phase 10 — Deployment, DevOps & Operations

**Document ID:** AICOS-OPS-001 · **Version:** 1.0

---

## 1. Objective

Define how the system is built, released, operated, monitored, secured, backed up and recovered — such that a small team can run it reliably, and a statutory auditor can be satisfied about controls.

---

## 2. Infrastructure as code

Everything is Terraform; nothing is created in the AWS console.

```
infra/
  modules/{network,ecs-service,rds,redis,s3-bucket,cloudfront,waf,observability,secrets}
  envs/{dev,staging,prod}/{main.tf,variables.tf,terraform.tfvars}
```

State in S3 with DynamoDB locking, one state file per environment. `prod` applies require a PR approval and run through CI with an OIDC-assumed role — no human holds long-lived AWS keys. Drift detection runs nightly and alerts on any out-of-band change.

---

## 3. CI/CD pipeline

```
┌─ Pull request ──────────────────────────────────────────────────────┐
│ lint · typecheck · unit · integration (Testcontainers) · E2E smoke   │
│ OpenAPI breaking-change check · SAST · secret scan · dep scan        │
│ architecture fitness (import boundaries, RLS coverage) · coverage    │
└──────────────────────────────────────────────────────────────────────┘
                     ↓ merge to main
┌─ Build ─────────────────────────────────────────────────────────────┐
│ build image (multi-stage, distroless) · SBOM · sign (cosign)         │
│ scan image (Trivy) · push to ECR by digest                           │
└──────────────────────────────────────────────────────────────────────┘
                     ↓ auto
┌─ dev ─────────┐   migrate → deploy → smoke → full E2E
                     ↓ manual approval
┌─ staging ─────┐   migration rehearsal on a production-shaped copy →
                    deploy → E2E → performance suite → UAT
                     ↓ manual approval (product + tech lead)
┌─ production ──┐   migrate (separate gated step) → blue/green deploy →
                    canary 10% for 15 min → full shift → auto-rollback on alarm
```

**Promotion is by image digest** — the exact artefact tested in staging runs in production. Deployments are expected multiple times per week; a small, frequent change is safer than a large, rare one.

---

## 4. Database migrations

Rules that make zero-downtime deploys possible:

1. Forward-only. Rollback is a new migration, never a `down` script (a `down` that drops a column destroys data).
2. Expand → migrate → contract across releases: add the new column, dual-write, backfill, switch reads, drop the old column in a *later* release.
3. Never rename in place; never add `NOT NULL` without a default or a completed backfill.
4. `CREATE INDEX CONCURRENTLY` only, outside transactions.
5. Long backfills run as background jobs in batches, not in the migration.
6. Migrations run as `aicos_migrator` (a role distinct from the application role) in a separate, gated pipeline step with its own approval.
7. Every production migration is rehearsed in staging against a restored production-shaped dataset, with the duration recorded. Anything projected over 30 seconds of locking is redesigned.

---

## 5. Configuration and secrets

Configuration comes from environment variables validated with Zod at boot — **the application refuses to start on invalid or missing configuration** rather than failing mysteriously later.

Secrets live in AWS Secrets Manager, injected by ECS task definitions, never in images, repositories or `.env` files. Rotation: database credentials 90 days (automatic), API keys 180 days, connector certificates 365 days. Per-tenant integration credentials (GSP tokens, Tally connector certs) are stored under a per-tenant secret path with KMS key separation.

Feature flags are database-backed per tenant, allowing progressive rollout and instant disable without a deploy — but they can never disable audit logging, RLS or authentication.

---

## 6. The Tally connector — packaging and operations

The one component that runs outside our infrastructure needs its own operational discipline.

| Aspect | Approach |
|---|---|
| Packaging | Signed Windows installer (MSI) registering a Windows Service with automatic restart |
| Configuration | Guided setup: tenant, company, Tally host/port, client certificate enrolment |
| Connectivity | **Outbound only** over HTTPS with mTLS. No inbound port is opened at the client site — this is what makes it acceptable on a small-business network |
| Updates | Self-update with signature verification, staged rollout, and a pinned-version option |
| Health | Heartbeat every 60 s; the platform raises an alert after 15 minutes of silence |
| Failure modes | Typed errors (`TALLY_OFFLINE`, `LEDGER_NOT_FOUND`, `PERIOD_LOCKED`, `DUPLICATE`, `PARSE_ERROR`) with distinct retry policies; permanent failures surface in the sync console with the remedy |
| Observability | Local rotating logs plus structured events forwarded to the platform |
| Recovery | The queue is durable server-side; a machine can be rebuilt and re-enrolled with no data loss |
| Fallback | A documented manual procedure (export vouchers to Tally XML and import) so the books are never blocked by connector downtime |

---

## 7. Security operations

| Control | Implementation |
|---|---|
| Network | Private subnets for all compute and data; ALB and NAT are the only public paths; VPC endpoints for S3, Secrets Manager, ECR; security groups reference other security groups, never CIDR ranges |
| Access | No SSH keys, no bastion — SSM Session Manager with full session logging; production access requires a break-glass approval and is time-boxed |
| IAM | Least privilege per service; CI uses OIDC federation (no static keys); permission boundaries on all roles |
| Encryption | KMS CMKs with separate keys for database, documents and connector credentials; TLS 1.3 in transit; per-tenant envelope encryption for documents |
| WAF | OWASP core rule set, rate limiting, bot control, geo rules |
| Vulnerability management | Daily image and dependency scans; critical patched within 7 days, high within 30 |
| Audit | CloudTrail to a separate, restricted account; application audit log immutable at the grant level with daily hash-chain anchoring |
| Access review | Quarterly, owned by the Senior Accountant, with a generated access-matrix report |
| Incident response | Documented runbook: detect → contain → eradicate → recover → post-mortem; DPDP Act breach-notification obligations documented with timelines and named responsibilities |
| Penetration testing | Before Wave 1 go-live and annually |

---

## 8. Backup and disaster recovery

| Asset | Backup | Retention | Restore target |
|---|---|---|---|
| PostgreSQL | Automated snapshots + PITR (5-min RPO) | 35 days | ≤ 2 h |
| PostgreSQL logical dumps | Nightly `pg_dump` to S3 (independent of RDS) | 8 years, Glacier after 90 days | ≤ 4 h |
| S3 documents | Versioning + cross-region replication to `ap-south-2`; Object Lock for legal hold | per retention policy | minutes |
| Secrets | Secrets Manager versioning | 30 days | minutes |
| Infrastructure | Terraform state (versioned S3) | indefinite | rebuild ≤ 2 h |

**RPO ≤ 5 minutes, RTO ≤ 4 hours.**

**Quarterly restore drills are mandatory and timed**, restoring into an isolated account and verifying with a data-integrity checklist (trial balance ties, stock value ties, document count matches, latest transaction present). An untested backup is not a backup — the drill result is recorded and reported to the board.

---

## 9. Monitoring and alerting

| Alert | Threshold | Severity | Action |
|---|---|---|---|
| API error rate | > 2% for 5 min | P1 page | Check recent deploy, roll back |
| API P95 latency | > 1 s for 10 min | P2 | Investigate slow queries |
| DB CPU | > 80% for 15 min | P2 | Identify query, consider scale |
| DB replica lag | > 60 s | P2 | Reduce report load |
| DB connections | > 85% of max | P1 | Pool exhaustion check |
| Queue age | > 15 min | P2 | Scale workers, check poison messages |
| DLQ depth | > 0 | P2 | Triage within one business day |
| Tally sync lag | > 4 h or heartbeat missing 15 min | P2 | Contact site, check connector |
| Tally drift | any unresolved at close | P1 | Blocks period close |
| Payment run failure | any | **P0 page** | Immediate; money is involved |
| Bank file downloaded twice | any | P1 | Possible duplicate payment; investigate |
| Backup failure | any | P1 | Re-run, verify |
| AI spend | > 150% of daily budget | P2 | Check routing and caching |
| Certificate expiry | < 21 days | P2 | Renew |
| Cross-tenant probe failure (synthetic) | any | **P0 page** | Isolation breach; treat as an incident |

On-call: business hours during Waves 1–2; 24×7 from Wave 3 with a documented rota. Every alert links to a runbook — an alert without a runbook is a defect.

---

## 10. Operational runbooks (index)

`RB-01` deploy and rollback · `RB-02` database failover and restore · `RB-03` Tally connector down · `RB-04` payment run failed mid-release · `RB-05` bank statement parse failure · `RB-06` DLQ triage and replay · `RB-07` AI provider outage (degradation ladder) · `RB-08` tenant data-export request (DPDP) · `RB-09` suspected security incident · `RB-10` period-close blocked · `RB-11` scaling for month-end load · `RB-12` restoring a single tenant's data.

Each runbook: symptoms → immediate containment → diagnosis steps with exact commands → resolution → verification → follow-up.

---

## 11. Environments and cost governance

Non-production environments scale to zero outside business hours (saving roughly 60% of their cost). Budget alarms at 80% and 100% of the monthly forecast. Cost allocation tags (`env`, `service`, `tenant-tier`) on every resource, with a monthly cost review. AI spend is tracked per tenant and per feature — if invoice extraction costs more than the keying it replaces, that must be visible immediately, not at year end.

---

## 12. Release management and change control

Release notes generated from conventional commits, reviewed by the product owner. Business-visible changes are communicated in advance with in-app announcements. A change-freeze window applies around statutory deadlines (GST filing 11th/20th, TDS quarterly, year end) — no production deploys on those days except P0 fixes. Emergency changes follow an expedited path with retrospective approval documented within 24 hours.

---

## 13. Reports, dashboards, AI, security, roles, future (mandated format)

- **Operational reports/dashboards:** system health and RED metrics, deployment frequency and change-failure rate (DORA), incident log with MTTR, backup and restore-drill status, security findings ageing, cost by service and tenant, integration health, AI spend and acceptance rate.
- **AI in operations:** anomaly detection on metrics, log clustering to surface novel failures, automated first-draft incident summaries, runbook suggestion on alert, capacity-forecasting from usage trends. AI never executes a remediation action automatically.
- **Security requirements:** §7, plus SOC 2-track control documentation from Wave 4, DPDP compliance records (consent, retention, breach notification), and vendor due diligence on every sub-processor.
- **Roles:** DevOps owns the pipeline and infrastructure; the tech lead approves production changes; the Senior Accountant owns the access review; the Executive Director is the accountable owner for data-breach notification.
- **Future enhancements:** multi-region active-passive DR · progressive delivery with automated canary analysis · FinOps automation for rightsizing · self-service tenant provisioning (Wave 4) · on-premise deployment option for tenants requiring local data control.
