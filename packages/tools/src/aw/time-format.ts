/**
 * Local time range for meeting labels and gap questions.
 * Example output: "Wed, Jun 4, 11:00 AM – 11:30 AM"
 */
export function formatLocalTimeRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateOpts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  };
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  const datePart = start.toLocaleDateString(undefined, dateOpts);
  const startTime = start.toLocaleTimeString(undefined, timeOpts);
  const endTime = end.toLocaleTimeString(undefined, timeOpts);
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    return `${datePart}, ${startTime} – ${endTime}`;
  }
  const endDate = end.toLocaleDateString(undefined, dateOpts);
  return `${datePart} ${startTime} – ${endDate} ${endTime}`;
}
