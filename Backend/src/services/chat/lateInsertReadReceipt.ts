/** True when a message is a late insert into history the reader already passed. */
export function isLateInsertRelativeToReadCursor(args: {
  messageServerSyncSeq: number | null | undefined;
  messageCreatedAt: Date;
  cursorReadMaxServerSyncSeq: number;
  cursorReadMaxCreatedAt: Date;
}): boolean {
  const msgSeq = args.messageServerSyncSeq ?? -1;
  if (msgSeq <= args.cursorReadMaxServerSyncSeq) return false;
  return args.messageCreatedAt.getTime() <= args.cursorReadMaxCreatedAt.getTime();
}
