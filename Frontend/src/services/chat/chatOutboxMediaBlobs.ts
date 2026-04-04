import { chatLocalDb } from './chatLocalDb';

function imgRowId(tempId: string, slot: number): string {
  return `${tempId}:img:${slot}`;
}

function voiceRowId(tempId: string): string {
  return `${tempId}:voice`;
}

export async function loadOutboxImageBlobs(tempId: string, count: number): Promise<Blob[]> {
  if (count <= 0) return [];
  const out: Blob[] = [];
  for (let i = 0; i < count; i++) {
    const row = await chatLocalDb.outboxMediaBlobs.get(imgRowId(tempId, i));
    if (row?.blob) out.push(row.blob);
  }
  return out;
}

export async function loadOutboxVoiceBlob(tempId: string): Promise<Blob | undefined> {
  return (await chatLocalDb.outboxMediaBlobs.get(voiceRowId(tempId)))?.blob;
}

export async function deleteOutboxImageBlobSlots(tempId: string, count: number): Promise<void> {
  if (count <= 0) return;
  await chatLocalDb.transaction('rw', chatLocalDb.outboxMediaBlobs, async () => {
    for (let i = 0; i < count; i++) {
      await chatLocalDb.outboxMediaBlobs.delete(imgRowId(tempId, i));
    }
  });
}

export async function deleteOutboxVoiceBlob(tempId: string): Promise<void> {
  await chatLocalDb.outboxMediaBlobs.delete(voiceRowId(tempId));
}

export async function deleteOutboxMediaBlobsForTempId(tempId: string): Promise<void> {
  await chatLocalDb.outboxMediaBlobs.where('tempId').equals(tempId).delete();
}
