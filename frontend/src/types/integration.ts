export interface LinkedCalendarSummary {
  id: number;
  googleId: string;
  displayName: string;
  colorHex?: string | null;
  accessRole: string;
}

export interface GoogleAccountSummary {
  id: number;
  email: string;
  displayName: string | null;
  lastSyncedAt: string | null;
  calendars: LinkedCalendarSummary[];
}

export interface GoogleIntegrationStatus {
  accounts: GoogleAccountSummary[];
}
