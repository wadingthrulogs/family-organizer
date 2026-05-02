export type TravelMode = 'DRIVE' | 'BICYCLE' | 'WALK' | 'TWO_WHEELER' | 'TRANSIT';

export interface CommuteRoute {
  id: number;
  name: string;
  destAddress: string;
  travelMode: TravelMode;
  showStartMin: number;
  showEndMin: number;
  daysOfWeek: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CongestionClass = 'low' | 'moderate' | 'heavy' | 'severe' | 'unknown';

export interface CommuteEta {
  routeId: number;
  name: string;
  destAddress: string;
  travelMode: TravelMode;
  showStartMin: number;
  showEndMin: number;
  daysOfWeek: string;
  homeAddress: string;
  durationMinutes: number;
  staticDurationMinutes: number;
  delayMinutes: number;
  distanceMeters: number;
  distanceMiles: number;
  polyline?: string;
  congestion?: CongestionClass[];
  fetchedAt: string;
}

export interface CommuteEtaError {
  routeId: number;
  name: string;
  destAddress: string;
  travelMode: TravelMode;
  showStartMin: number;
  showEndMin: number;
  daysOfWeek: string;
  homeAddress: string;
  error: { code: string; message: string };
}

export type CommuteEtaItem =
  | { ok: true; data: CommuteEta }
  | { ok: false; data: CommuteEtaError };

export interface UpcomingCommute {
  routeId: number;
  name: string;
  showStartMin: number;
  showEndMin: number;
  dayOffset: number;
}

export interface EventCommute {
  eventId: number;
  title: string;
  startAt: string;
  location: string;
  durationMinutes?: number;
  staticDurationMinutes?: number;
  delayMinutes?: number;
  distanceMiles?: number;
  leaveByISO?: string;
  polyline?: string;
  congestion?: CongestionClass[];
  fetchedAt?: string;
  error?: { code: string; message: string };
}

export interface CommuteEtasResponse {
  items: CommuteEtaItem[];
  total: number;
  upcoming: UpcomingCommute | null;
  eventCommutes?: EventCommute[];
  mapboxToken?: string;
}
