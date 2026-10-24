/**
 * Demand forecasting and the statistics behind the Analytics page. Plain
 * functions over arrays — no database access — so they're easy to test.
 *
 * The forecast is Holt's damped-trend exponential smoothing on daily usage,
 * with day-of-week factors learned from the item's own history. It adapts to
 * each item (busy weekends, a usage level drifting up or down) while staying
 * cheap enough to run for every item on every page load.
 */

export const FORECAST_DAYS = 28;

// Smoothing weights: how quickly the level and trend react to new days.
const ALPHA = 0.15;
const BETA = 0.03;
// Each day further out, the trend counts for 10% less, so a short-lived
// rise doesn't project to infinity.
const PHI = 0.9;
// Weekday factors are pulled toward 1 as if there were this many extra
// "average" weeks, so a couple of odd Saturdays can't swing the forecast.
const WEEKDAY_SHRINK_WEEKS = 4;

export interface ForecastResult {
  /** Predicted usage for each of the next FORECAST_DAYS days, starting today. */
  daily: number[];
  /** Typical size of a one-day forecast miss (standard deviation), for safety stock. */
  dailyError: number;
  /** "low" when there's under four weeks of history or barely any usage to learn from. */
  confidence: "normal" | "low";
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const mean = (values: number[]) => (values.length === 0 ? 0 : sum(values) / values.length);

export function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(sum(values.map((v) => (v - m) ** 2)) / (values.length - 1));
}

export function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median absolute deviation: a spread measure that one huge outlier can't distort. */
export function medianAbsoluteDeviation(values: number[]) {
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

/**
 * Caps freak days (a one-off event, a typo) at the edge of the item's normal
 * range, so a single spike can't double the forecast. Spikes are still
 * reported separately as unusual activity.
 */
export function capOutliers(usage: number[]) {
  const busyDays = usage.filter((v) => v > 0);
  if (busyDays.length < 5) return usage;
  const typical = median(busyDays);
  const spread = Math.max(1.4826 * medianAbsoluteDeviation(busyDays), 0.5 * typical, 1);
  const cap = typical + 5 * spread;
  return usage.map((v) => Math.min(v, cap));
}

/**
 * Learns how each weekday compares with an average day (1.2 = 20% busier).
 * `weekdays[i]` is the weekday (0–6) of `usage[i]`.
 */
export function weekdayFactors(usage: number[], weekdays: number[]) {
  const overall = mean(usage);
  if (overall === 0) return [1, 1, 1, 1, 1, 1, 1];
  const totals = [0, 0, 0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  usage.forEach((value, i) => {
    totals[weekdays[i]] += value;
    counts[weekdays[i]]++;
  });
  const factors = totals.map(
    (total, d) => (total + WEEKDAY_SHRINK_WEEKS * overall) / ((counts[d] + WEEKDAY_SHRINK_WEEKS) * overall)
  );
  // Rescale so an average week still sums to the same total.
  const average = mean(factors);
  return factors.map((f) => f / average);
}

/**
 * Forecasts the next FORECAST_DAYS days of usage.
 *
 * @param usage    units used per day, oldest first, ending yesterday
 * @param weekdays weekday (0–6) of each day in `usage`
 * @param todayWeekday weekday of the first forecast day
 */
export function forecastUsage(rawUsage: number[], weekdays: number[], todayWeekday: number): ForecastResult {
  const usage = capOutliers(rawUsage);
  const usedOnDays = usage.filter((v) => v > 0).length;

  // Too little to learn patterns from: project the plain average forward.
  if (usage.length < 14 || usedOnDays < 3) {
    const average = mean(usage);
    return {
      daily: Array(FORECAST_DAYS).fill(average),
      dailyError: standardDeviation(usage),
      confidence: "low",
    };
  }

  const factors = weekdayFactors(usage, weekdays);
  const adjusted = usage.map((v, i) => v / factors[weekdays[i]]);

  let level = mean(adjusted.slice(0, 7));
  let trend = 0;
  const misses: number[] = [];

  for (let i = 0; i < adjusted.length; i++) {
    const predicted = Math.max(0, level + PHI * trend);
    // Skip the first week while the model is still warming up.
    if (i >= 7) misses.push(usage[i] - predicted * factors[weekdays[i]]);

    const previousLevel = level;
    level = ALPHA * adjusted[i] + (1 - ALPHA) * (level + PHI * trend);
    trend = BETA * (level - previousLevel) + (1 - BETA) * PHI * trend;
  }

  const daily: number[] = [];
  let dampedTrend = 0;
  for (let h = 1; h <= FORECAST_DAYS; h++) {
    dampedTrend += PHI ** h * trend;
    const weekday = (todayWeekday + h - 1) % 7;
    daily.push(Math.max(0, (level + dampedTrend) * factors[weekday]));
  }

  return {
    daily,
    dailyError: Math.sqrt(mean(misses.map((m) => m * m))),
    confidence: usage.length < 28 || usedOnDays < 6 ? "low" : "normal",
  };
}

/**
 * Days until stock runs out at the forecast rate, or null if it lasts beyond
 * a year (or nothing is being used). Past the forecast window, the last
 * week's average rate is carried forward.
 */
export function daysUntilEmpty(onHand: number, daily: number[]) {
  if (onHand <= 0) return 0;
  let remaining = onHand;
  for (let day = 0; day < daily.length; day++) {
    remaining -= daily[day];
    if (remaining <= 0) return day;
  }
  const lateRate = mean(daily.slice(-7));
  if (lateRate <= 0) return null;
  const days = daily.length + Math.floor(remaining / lateRate);
  return days > 365 ? null : days;
}

// 1.65 standard deviations covers 95% of normal variation — the chance of
// running out before a delivery arrives is about 1 in 20 order cycles.
const SERVICE_LEVEL_Z = 1.65;

/**
 * The stock level at which to reorder: expected use while waiting for a
 * delivery, plus safety stock for days busier than forecast.
 */
export function suggestedReorderPoint(dailyRate: number, dailyError: number, leadTimeDays: number) {
  return Math.ceil(dailyRate * leadTimeDays + SERVICE_LEVEL_Z * dailyError * Math.sqrt(leadTimeDays));
}
