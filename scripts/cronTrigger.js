/**
 * GitHub Actions Hourly Cron Trigger Script
 * Runs headlessly in GitHub Actions cloud environment.
 * Fetches live Android jobs, matches resume skills, and dispatches email via Resend.
 */

const storage = require('../services/storage');
const scheduler = require('../services/scheduler');

async function main() {
  console.log('====================================================');
  console.log('🚀 GitHub Actions Hourly Native Android Job Alert Cron');
  console.log('====================================================');

  try {
    const result = await scheduler.executeJobCycle();
    console.log('Execution Completed:', JSON.stringify(result, null, 2));

    if (result.lastError) {
      console.error('Cron Execution Error:', result.lastError);
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal Cron Script Error:', err);
    process.exit(1);
  }
}

main();
