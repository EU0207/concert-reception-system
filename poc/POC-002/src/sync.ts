import type { PocEvent, RemoteEvent } from "./domain";
import { PocRepository } from "./repository";

export interface UploadAcknowledgement {
  eventId: string;
  serverReceivedAt: string;
  alreadyExisted: boolean;
}

export interface RemoteEventStore {
  ensureRun(runId: string, performanceId: string): Promise<void>;
  upload(event: PocEvent, authUid: string): Promise<UploadAcknowledgement>;
  list(runId: string): Promise<RemoteEvent[]>;
  subscribe(runId: string, onEvents: (events: RemoteEvent[]) => void): () => void;
}

export interface SyncResult {
  attempted: number;
  uploaded: number;
  acknowledgedExisting: number;
  downloaded: number;
  failedEventIds: string[];
  failureMessages: string[];
}

function emptyResult(): SyncResult {
  return {
    attempted: 0,
    uploaded: 0,
    acknowledgedExisting: 0,
    downloaded: 0,
    failedEventIds: [],
    failureMessages: []
  };
}

export async function pushPending(
  repository: PocRepository,
  remote: RemoteEventStore,
  runId: string,
  authUid: string
): Promise<SyncResult> {
  const pending = await repository.listPending(runId);
  const result = emptyResult();
  await uploadPending(repository, remote, authUid, pending, result);
  return result;
}

export async function synchronize(
  repository: PocRepository,
  remote: RemoteEventStore,
  runId: string,
  authUid: string
): Promise<SyncResult> {
  const pending = await repository.listPending(runId);
  const result = emptyResult();
  await uploadPending(repository, remote, authUid, pending, result);

  const remoteEvents = await remote.list(runId);
  for (const event of remoteEvents) {
    await repository.upsertRemote(event);
    result.downloaded += 1;
  }
  await repository.setMetadata("lastSuccessfulSyncAt", new Date().toISOString());
  return result;
}

async function uploadPending(
  repository: PocRepository,
  remote: RemoteEventStore,
  authUid: string,
  pending: Awaited<ReturnType<PocRepository["listPending"]>>,
  result: SyncResult
): Promise<void> {

  let nextIndex = 0;
  const uploadWorker = async (): Promise<void> => {
    while (nextIndex < pending.length) {
      const event = pending[nextIndex];
      nextIndex += 1;
      if (!event) return;
      result.attempted += 1;
      try {
        const {
          syncStatus: _syncStatus,
          serverReceivedAt: _serverReceivedAt,
          ...businessEvent
        } = event;
        const acknowledgement = await remote.upload(businessEvent as PocEvent, authUid);
        await repository.markSynced(event.eventId, acknowledgement.serverReceivedAt);
        if (acknowledgement.alreadyExisted) result.acknowledgedExisting += 1;
        else result.uploaded += 1;
      } catch (error) {
        result.failedEventIds.push(event.eventId);
        const message = error instanceof Error ? error.message : String(error);
        if (!result.failureMessages.includes(message)) result.failureMessages.push(message);
      }
    }
  };
  const workerCount = Math.min(8, pending.length);
  await Promise.all(Array.from({ length: workerCount }, () => uploadWorker()));
}
