import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

/** The pgvector image the contract suites and the compose profile run on (ADR 0034). */
export const PGVECTOR_IMAGE = 'pgvector/pgvector:0.8.7-pg18-trixie';

declare module 'vitest' {
  export interface ProvidedContext {
    postgresAdminUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

/** Starts one Postgres for the whole test project; each test gets its own database. */
export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer(PGVECTOR_IMAGE).start();
  project.provide('postgresAdminUrl', container.getConnectionUri());
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
