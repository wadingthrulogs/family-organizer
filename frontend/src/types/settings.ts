export interface QuietHours {
  start: string;
  end: string;
}

export interface HouseholdSettings {
  householdName: string;
  timezone: string;
  quietHours: QuietHours;
  hiddenTabs?: string[];
  theme?: string;
  weatherLocation?: string;
  weatherUnits?: 'imperial' | 'metric';
  // Google OAuth
  googleClientId?: string | null;
  googleClientSecretSet?: boolean;
  /** Write-only: sent in PATCH to update the secret; never returned by GET */
  googleClientSecret?: string | null;
  // Server config — plaintext (non-sensitive)
  appBaseUrl?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpFrom?: string | null;
  // Server config — write-only secrets: GET returns boolean flags, never plaintext
  openweatherApiKeySet?: boolean;
  smtpPassSet?: boolean;
  pushVapidPublicKeySet?: boolean;
  pushVapidPrivateKeySet?: boolean;
  /** Write-only */
  openweatherApiKey?: string | null;
  /** Write-only */
  smtpPass?: string | null;
  /** Write-only */
  pushVapidPublicKey?: string | null;
  /** Write-only */
  pushVapidPrivateKey?: string | null;
}
