export interface CalendarAttendee {
  name?: string;
  email?: string;
  responseStatus?: string;
}

export interface CalendarMeta {
  range: {
    start: string;
    end: string;
  };
  total: number;
}

export interface CalendarEvent {
  id: number;
  linkedCalendarId?: number | null;
  source?: string;
  sourceEventId?: string | null;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string;
  colorHex?: string | null;
  location?: string | null;
  visibility?: string | null;
  attendees: CalendarAttendee[];
  linkedCalendar?: {
    id: number;
    displayName: string;
    colorHex?: string | null;
  } | null;
}

export interface CalendarEventResponse {
  items: CalendarEvent[];
  meta: CalendarMeta;
}
