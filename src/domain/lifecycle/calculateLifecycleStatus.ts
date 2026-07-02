import type { CalculateLifecycleStatusInput, LifecycleDisplay, LifecycleStatus } from "./types";

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
const msPerDay = 24 * 60 * 60 * 1000;

export function calculateLifecycleStatus({
  item,
  now,
  deprecatedThresholdDays,
}: CalculateLifecycleStatusInput): LifecycleStatus {
  if (item.hazardous) {
    return "hazardous";
  }

  const today = toLocalDateKey(now);

  if (isPastDateKey(item.useByDate, today)) {
    return "unsupported";
  }

  if (isPastDateKey(item.bestBeforeDate, today)) {
    return "eol";
  }

  const daysUntilBestBefore = daysUntilDateKey(item.bestBeforeDate, today);
  if (
    daysUntilBestBefore !== null &&
    daysUntilBestBefore >= 0 &&
    daysUntilBestBefore <= deprecatedThresholdDays
  ) {
    return "deprecated";
  }

  return "active";
}

export function describeLifecycleStatus(status: LifecycleStatus): LifecycleDisplay {
  switch (status) {
    case "active":
      return { status, label: "Supported", tone: "success" };
    case "deprecated":
      return { status, label: "Deprecated", tone: "attention" };
    case "eol":
      return { status, label: "EOL", tone: "severe" };
    case "unsupported":
      return { status, label: "Unsupported", tone: "danger" };
    case "hazardous":
      return { status, label: "Critical", tone: "danger" };
  }
}

export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function daysUntilDateKey(
  targetDateKey: string | undefined,
  todayDateKey: string,
): number | null {
  if (!isDateKey(targetDateKey) || !isDateKey(todayDateKey)) {
    return null;
  }

  const target = parseDateKey(targetDateKey);
  const today = parseDateKey(todayDateKey);
  return (
    (Date.UTC(target.year, target.monthIndex, target.day) -
      Date.UTC(today.year, today.monthIndex, today.day)) /
    msPerDay
  );
}

function isPastDateKey(dateKey: string | undefined, todayDateKey: string): boolean {
  return isDateKey(dateKey) && dateKey < todayDateKey;
}

function isDateKey(value: string | undefined): value is string {
  return Boolean(value && dateKeyPattern.test(value));
}

function parseDateKey(dateKey: string): { year: number; monthIndex: number; day: number } {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, monthIndex: month - 1, day };
}
