import cron from 'node-cron';
import {
  sendMorningTaskDigests,
  sendCloseDateWarnings,
  sendEodSummary,
  sendStaleDealsAlert,
  sendOverdueTaskNudges,
} from '../utils/notifications.js';

// All times are Asia/Manila (PHT = UTC+8)
// Cron format: second(opt) minute hour day month weekday

export function startScheduler() {
  // B1 — Morning task digest: 8:00 AM daily
  cron.schedule('0 8 * * *', () => {
    console.log('[scheduler] Morning task digest');
    sendMorningTaskDigests().catch(e => console.error('[scheduler] morning digest:', e.message));
  }, { timezone: 'Asia/Manila' });

  // B2 — Close date warnings: 12:00 PM daily
  cron.schedule('0 12 * * *', () => {
    console.log('[scheduler] Close date warnings');
    sendCloseDateWarnings().catch(e => console.error('[scheduler] close date warnings:', e.message));
  }, { timezone: 'Asia/Manila' });

  // B3 — End-of-day summary: 6:00 PM daily to sales@benefi.ph
  cron.schedule('0 18 * * *', () => {
    console.log('[scheduler] EOD summary');
    sendEodSummary().catch(e => console.error('[scheduler] eod summary:', e.message));
  }, { timezone: 'Asia/Manila' });

  // B4 — Stale deal alert: 9:00 AM every Monday
  cron.schedule('0 9 * * 1', () => {
    console.log('[scheduler] Stale deals alert');
    sendStaleDealsAlert().catch(e => console.error('[scheduler] stale deals:', e.message));
  }, { timezone: 'Asia/Manila' });

  // B5 — Overdue task nudges: 9:00 AM daily
  cron.schedule('0 9 * * *', () => {
    console.log('[scheduler] Overdue task nudges');
    sendOverdueTaskNudges().catch(e => console.error('[scheduler] overdue nudges:', e.message));
  }, { timezone: 'Asia/Manila' });

  console.log('  Scheduler   → email jobs active (PH timezone)');
}
