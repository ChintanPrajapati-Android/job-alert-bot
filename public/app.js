let appState = {
  config: null,
  jobs: []
};

document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  fetchLiveJobs();
  initEvents();
});

async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.success && data.config) {
      appState.config = data.config;
      renderConfig();
    }
  } catch (err) {
    showToast('Failed to load configuration');
  }
}

function renderConfig() {
  if (!appState.config) return;

  const profile = appState.config.userProfile || {};
  const emailCfg = appState.config.emailConfig || {};
  const settings = appState.config.settings || {};

  document.getElementById('cfg-name').value = profile.name || 'Chintan Prajapati';
  document.getElementById('cfg-email').value = emailCfg.recipient || profile.email || 'ctnprt@gmail.com';
  document.getElementById('cfg-resend-key').value = emailCfg.resendApiKey || '';

  const toggle = document.getElementById('automation-toggle');
  toggle.checked = settings.activeScheduler !== false;
  
  document.getElementById('cron-interval-text').textContent = toggle.checked ? 
    `Active (Checking every ${settings.cronIntervalMinutes || 60} mins)` : 
    'Automation Disabled';

  renderSkills(profile.skills || ['Kotlin', 'Java', 'Android SDK', 'Jetpack Compose', 'MVVM', 'Coroutines', 'Room', 'BLE']);
}

function renderSkills(skills) {
  const container = document.getElementById('skills-container');
  container.innerHTML = skills.map(skill => `<span class="chip">${skill}</span>`).join('');
}

async function fetchLiveJobs() {
  const container = document.getElementById('jobs-list');
  if (appState.jobs.length === 0) {
    container.innerHTML = '<div class="loading-text">Fetching Native Android jobs...</div>';
  }

  try {
    const res = await fetch('/api/jobs/live');
    const data = await res.json();

    if (data.success) {
      appState.jobs = data.jobs || [];
      const matchCount = data.matchedCount || appState.jobs.length;
      
      // Update count badge stably
      document.getElementById('match-count').textContent = matchCount;

      if (appState.jobs.length === 0) {
        container.innerHTML = '<div class="loading-text">No matching Native Android jobs found right now.</div>';
        return;
      }

      container.innerHTML = appState.jobs.slice(0, 15).map(job => `
        <div class="job-row">
          <div class="job-info">
            <h4>${job.title}</h4>
            <div class="job-meta">
              🏢 <strong>${job.company}</strong> &nbsp;•&nbsp; ${job.locationFormatted || job.location}
            </div>
          </div>
          <div class="job-actions">
            <span class="score-tag">${job.matchScore}% Match</span>
            <a href="${job.applyUrl}" target="_blank" class="apply-link">Apply 🚀</a>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    if (appState.jobs.length === 0) {
      container.innerHTML = '<div class="loading-text" style="color: red;">Error loading jobs.</div>';
    }
  }
}

function initEvents() {
  // Toggle Automation ON/OFF
  document.getElementById('automation-toggle').addEventListener('change', async (e) => {
    const activeScheduler = e.target.checked;
    if (!appState.config) return;

    appState.config.settings.activeScheduler = activeScheduler;
    document.getElementById('cron-interval-text').textContent = activeScheduler ? 
      `Active (Checking every ${appState.config.settings.cronIntervalMinutes || 60} mins)` : 
      'Automation Disabled';

    await saveConfig();
    showToast(activeScheduler ? 'Automation Turned ON' : 'Automation Disabled');
  });

  // Save Configuration
  document.getElementById('btn-save').addEventListener('click', async () => {
    if (!appState.config) return;

    appState.config.userProfile.name = document.getElementById('cfg-name').value;
    appState.config.emailConfig.recipient = document.getElementById('cfg-email').value;
    appState.config.emailConfig.resendApiKey = document.getElementById('cfg-resend-key').value.trim();

    await saveConfig();
    showToast('Settings saved successfully!');
  });

  // Send Email Now Trigger
  document.getElementById('btn-trigger').addEventListener('click', async () => {
    showToast('Executing live Android job fetch & sending email...');
    try {
      const res = await fetch('/api/trigger', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast('Email Sent Successfully!');
        fetchLiveJobs();
      }
    } catch (err) {
      showToast('Failed to trigger email');
    }
  });
}

async function saveConfig() {
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(appState.config)
    });
  } catch (err) {
    console.error('Save config error:', err);
  }
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}
