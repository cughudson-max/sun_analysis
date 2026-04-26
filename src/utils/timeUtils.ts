export function getNowParts(timeZone?: string) {
  const now = new Date();
  if (!timeZone) {
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate()
    };
  }

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false
  });
  const parts = dtf.formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  if ([year, month, day].some(n => Number.isNaN(n))) {
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate()
    };
  }
  return { year, month, day };
}

export function getTimeZoneOffsetMinutes(timeZone: string, date: Date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  const second = Number(get('second'));
  const asUTC = Date.UTC(year, month - 1, day, hour, minute, second);
  return (asUTC - date.getTime()) / 60000;
}

export function zonedTimeToUtc(
  {
    year,
    month,
    day,
    hour,
    minute
  }: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string
) {
  const guessUTC = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  let offset = getTimeZoneOffsetMinutes(timeZone, guessUTC);
  let adjusted = new Date(guessUTC.getTime() - offset * 60000);
  const offset2 = getTimeZoneOffsetMinutes(timeZone, adjusted);
  if (offset2 !== offset) {
    adjusted = new Date(guessUTC.getTime() - offset2 * 60000);
  }
  return adjusted;
}
