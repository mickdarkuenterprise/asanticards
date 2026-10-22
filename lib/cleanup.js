const supabase = require('./supabase');

// Orders are created as 'pending' before the customer pays. Ones that are
// never paid would sit in the admin list forever, so cancel them after a while.
// If a payment for a cancelled order does arrive later, the webhook still
// marks it paid (see CLAIMABLE_STATUSES in routes/webhook.js).
const STALE_AFTER_HOURS = 48;
const RUN_EVERY_MS = 60 * 60 * 1000; // hourly

async function cancelStalePendingOrders() {
  const cutoff = new Date(Date.now() - STALE_AFTER_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .select('ref');

  if (error) {
    console.error('[cleanup] Cancelling stale orders failed:', error.message);
    return;
  }
  if (data.length) {
    console.log(`[cleanup] Cancelled ${data.length} unpaid order(s) older than ${STALE_AFTER_HOURS}h`);
  }
}

function startCleanupJob() {
  const run = () => cancelStalePendingOrders().catch(err => console.error('[cleanup]', err.message));
  run();
  setInterval(run, RUN_EVERY_MS).unref();
}

module.exports = { startCleanupJob, cancelStalePendingOrders };
