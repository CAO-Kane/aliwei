import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

let _checkpointer: SqliteSaver | null = null;

function dbPath(): string {
  return process.env.CHECKPOINTER_DB_PATH ?? "agent_state.db";
}

function createCheckpointer(): SqliteSaver {
  const cp = SqliteSaver.fromConnString(dbPath());
  // WAL mode: gives read concurrency while a single writer holds the lock.
  // Sufficient for single-instance low-concurrency deployment.
  (cp as any).db?.pragma("journal_mode = WAL");
  return cp;
}

export function getCheckpointer(): SqliteSaver {
  if (!_checkpointer) {
    _checkpointer = createCheckpointer();
  }
  return _checkpointer;
}

export function resetCheckpointer(): void {
  _checkpointer = null;
}
