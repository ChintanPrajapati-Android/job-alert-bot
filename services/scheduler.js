const storage = require('./storage');
const jobFetcher = require('./jobFetcher');
const resumeMatcher = require('./resumeMatcher');
const emailNotifier = require('./emailNotifier');

let cronTimer = null;
let isJobRunning = false;
let lastExecutionStatus = {
  timestamp: null,
  status: 'Idle',
  fetchedCount: 0,
  matchedCount: 0,
  newJobsSent: 0,
  lastError: null,
  emailPreviewUrl: null
};

async function executeJobCycle() {
  if (isJobRunning) {
    console.log('Job cycle already in progress, skipping tick.');
    return lastExecutionStatus;
  }

  isJobRunning = true;
  lastExecutionStatus.status = 'Running';
  lastExecutionStatus.timestamp = new Date().toISOString();
  lastExecutionStatus.lastError = null;

  try {
    const config = storage.getConfig();
    const history = storage.getHistory();
    const sentJobIds = new Set(history.sentJobIds || []);

    console.log('\n--- [CRON TICK] Starting Hourly Job Fetch & Resume Match ---');

    // 1. Fetch Live Jobs
    const allJobs = await jobFetcher.fetchAllLiveJobs(
      config.userProfile.skills,
      config.settings.jsearchApiKey
    );
    lastExecutionStatus.fetchedCount = allJobs.length;

    // 2. Match & Filter Jobs against Resume
    const matchedJobs = resumeMatcher.rankAndFilterJobs(
      allJobs,
      config.userProfile,
      config.settings.minMatchPercentage || 45
    );
    lastExecutionStatus.matchedCount = matchedJobs.length;

    // 3. Deduplicate (Filter out already emailed jobs)
    const newJobsToNotify = matchedJobs.filter(job => !sentJobIds.has(job.id));
    console.log(`Found ${matchedJobs.length} matching jobs (${newJobsToNotify.length} brand new).`);

    if (newJobsToNotify.length > 0) {
      // Limit batch size to top 15 jobs per email
      const topBatch = newJobsToNotify.slice(0, 15);

      // 4. Send Email Notification
      const sendResult = await emailNotifier.sendEmailNotification(
        config.emailConfig,
        config.userProfile,
        topBatch
      );

      if (sendResult.success) {
        storage.recordSentJobs(topBatch);
        lastExecutionStatus.newJobsSent = topBatch.length;
        lastExecutionStatus.emailPreviewUrl = sendResult.previewUrl || null;
        lastExecutionStatus.status = `Completed (${topBatch.length} jobs notified)`;
      } else {
        lastExecutionStatus.status = 'Email Failed';
        lastExecutionStatus.lastError = sendResult.error || 'Failed to dispatch email';
      }
    } else {
      lastExecutionStatus.newJobsSent = 0;
      lastExecutionStatus.status = 'Completed (No new matching jobs)';
    }

  } catch (err) {
    console.error('Error during job cycle execution:', err);
    lastExecutionStatus.status = 'Failed';
    lastExecutionStatus.lastError = err.message;
  } finally {
    isJobRunning = false;
  }

  return lastExecutionStatus;
}

function startScheduler(intervalMinutes = 60) {
  stopScheduler();
  const ms = intervalMinutes * 60 * 1000;
  console.log(`Starting background scheduler (Every ${intervalMinutes} minutes)...`);

  // Run first cycle immediately
  executeJobCycle();

  // Schedule periodic tick
  cronTimer = setInterval(() => {
    executeJobCycle();
  }, ms);
}

function stopScheduler() {
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
    console.log('Background scheduler stopped.');
  }
}

function getStatus() {
  const config = storage.getConfig();
  return {
    isSchedulerActive: !!cronTimer,
    intervalMinutes: config.settings.cronIntervalMinutes || 60,
    lastExecution: lastExecutionStatus
  };
}

module.exports = {
  executeJobCycle,
  startScheduler,
  stopScheduler,
  getStatus
};
