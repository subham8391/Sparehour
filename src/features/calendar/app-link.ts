// Where a calendar consent that was started in the Android app comes back to: the app's own link (`scheme` in
// mobile/app.json). One constant, read by the server, which sends the browser there with a sealed ticket
// (server/calendar/app-connect.ts), and by the app, which waits for exactly this address
// (mobile/src/calendar/connect-flow.ts). Nothing a caller sends ever chooses it. No imports: the phone reads this file.
export const CALENDAR_APP_LINK = "sparehour://calendar-connected";
