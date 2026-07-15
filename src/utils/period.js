/**
 * Turns a Date into bucket strings for daily / weekly / monthly periodic leaderboards.
 * Buckets are UTC-based so keys are deterministic regardless of server timezone.
 */

function pad(n) {
  return String(n).padStart(2, '0');
}

function dailyBucket(date = new Date()) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function monthlyBucket(date = new Date()) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

// ISO week number (1-53)
function weeklyBucket(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad(weekNo)}`;
}

const VALID_PERIODS = ['daily', 'weekly', 'monthly'];

function bucketFor(period, date = new Date()) {
  switch (period) {
    case 'daily':
      return dailyBucket(date);
    case 'weekly':
      return weeklyBucket(date);
    case 'monthly':
      return monthlyBucket(date);
    default:
      throw new Error(`Unknown period "${period}". Valid periods: ${VALID_PERIODS.join(', ')}`);
  }
}

module.exports = { bucketFor, dailyBucket, weeklyBucket, monthlyBucket, VALID_PERIODS };
