import DisplayPage from './DisplayPage';

/**
 * The guest display: same shell as the kiosk, but only guest-safe widgets
 * (nothing that shows household data) and, if a display PIN is set, a PIN
 * gate on leaving. See DisplayPage.
 */
export default function GuestPage() {
  return <DisplayPage mode="guest" />;
}
