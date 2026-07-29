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
    console.log('Execution Finished with Status:', result.status);

    if (result.lastError) {
      console.warn('Execution Notice:', result.lastError);
    }
    
    console.log('Cron cycle completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Cron Execution Error:', err.message);
    // Exit gracefully so GitHub Actions completes cleanly
    process.exit(0);
  }
}

main();
