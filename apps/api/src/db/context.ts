/**
 * Tenant-scoped database access.
 *
 * Every unit of work runs inside a transaction that first sets the RLS session
 * variables (Phase 3 §4). `set_config(..., true)` is transaction-local, so a
 * pooled connection cannot leak one tenant's context into another tenant's
 * request — which is the failure mode that makes shared-schema tenancy
 * dangerous when it is done by hand in WHERE clauses instead.
 *
 * The application connects as `aicos_app`, which is not the table owner and
 * does not hold BYPASSRLS. If the guard below is ever bypassed, the database
 * returns zero rows rather than another tenant's data.
 */

import { Pool, type PoolClient } from 'pg';

export interface RequestContext {
  tenantId: string;
  userId: string;
  /** Projects this user may see. Ignored when `allProjects` is true. */
  projectIds: string[];
  allProjects: boolean;
}

export type Tx = PoolClient;

export class Database {
  constructor(private readonly pool: Pool) {}

  static fromEnv(connectionString = process.env.DATABASE_URL): Database {
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set — refusing to start with invalid configuration');
    }
    return new Database(new Pool({ connectionString, max: 10 }));
  }

  /**
   * Run `work` inside a transaction with RLS context applied.
   * Commits on success, rolls back on any thrown error.
   */
  async withContext<T>(ctx: RequestContext, work: (tx: Tx) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `SELECT set_config('app.tenant_id',    $1, true),
                set_config('app.user_id',      $2, true),
                set_config('app.project_ids',  $3, true),
                set_config('app.all_projects', $4, true)`,
        [ctx.tenantId, ctx.userId, ctx.projectIds.join(','), String(ctx.allProjects)],
      );
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Assert that a connection really is tenant-scoped.
 *
 * Used by the integration suite: a superuser bypasses RLS unconditionally, so a
 * test run as `postgres` would pass while proving nothing. This turns that
 * silent false-positive into a loud failure.
 */
export async function assertRlsActive(tx: Tx): Promise<void> {
  const { rows } = await tx.query<{ is_superuser: boolean; tenant: string | null }>(
    `SELECT usesuper AS is_superuser,
            current_setting('app.tenant_id', true) AS tenant
       FROM pg_user WHERE usename = current_user`,
  );
  const row = rows[0];
  if (!row) throw new Error('Could not determine the current database role');
  if (row.is_superuser) {
    throw new Error(
      'Connected as a superuser: row-level security is bypassed, so isolation is unverified. ' +
        'Connect as a non-superuser member of aicos_app.',
    );
  }
  if (!row.tenant) throw new Error('Tenant context was not applied to this transaction');
}
