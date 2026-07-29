export type PlayIntentCreateSource =
  | {
      type: 'PROPOSAL';
      proposalId: string;
      inviteeIds: string[];
    }
  | {
      type: 'DIRECT';
      hostIntentId: string;
      invitees: Array<{ userId: string; intentId: string }>;
    };
