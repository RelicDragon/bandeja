export interface ClubIntegrationParams {
  startDate: Date;
  endDate: Date;
  duration: number;
  clubConfig?: Record<string, any>;
}

export interface ExternalCourtSlot {
  externalCourtId: string;
  externalCourtName: string;
  startTime: string;
  endTime: string;
  isBooked: boolean;
}

export interface ClubIntegrationResult {
  slots: ExternalCourtSlot[];
  metadata?: Record<string, any>;
}

export type ClubIntegrationFunction = (
  params: ClubIntegrationParams
) => Promise<ClubIntegrationResult>;

