const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Default Configuration
const defaultConfig = {
  userProfile: {
    name: "Job Seeker",
    email: "user@example.com",
    skills: ["JavaScript", "Node.js", "React", "HTML", "CSS", "Python", "Full Stack", "Git"],
    targetTitles: ["Full Stack Developer", "Frontend Developer", "Backend Developer", "Software Engineer"],
    minSalary: 0,
    resumeText: "Experienced Software Engineer with proficiency in JavaScript, Node.js, React, HTML, CSS, Express, and Database management."
  },
  emailConfig: {
    service: "smtp", // "smtp" or "ethereal"
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    user: "",
    pass: "",
    recipient: ""
  },
  settings: {
    cronIntervalMinutes: 60,
    minMatchPercentage: 50,
    activeScheduler: true,
    jsearchApiKey: ""
  }
};

function getConfig() {
  let config = defaultConfig;
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      config = { ...defaultConfig, ...JSON.parse(raw) };
    } catch (err) {
      console.error('Error reading config, using default:', err);
    }
  } else {
    saveConfig(defaultConfig);
  }

  // Override config with environment variables if available (e.g. in GitHub Actions)
  if (process.env.RECIPIENT_EMAIL) {
    if (!config.emailConfig) config.emailConfig = {};
    config.emailConfig.recipient = process.env.RECIPIENT_EMAIL;
  }
  if (process.env.RESEND_API_KEY) {
    if (!config.emailConfig) config.emailConfig = {};
    config.emailConfig.resendApiKey = process.env.RESEND_API_KEY;
  }
  if (process.env.JSEARCH_API_KEY) {
    if (!config.settings) config.settings = {};
    config.settings.jsearchApiKey = process.env.JSEARCH_API_KEY;
  }

  return config;
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving config:', err);
  }
}

function getHistory() {
  if (!fs.existsSync(HISTORY_FILE)) {
    return { sentJobIds: [], jobLogs: [] };
  }
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return { sentJobIds: [], jobLogs: [] };
  }
}

function saveHistory(history) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving history:', err);
  }
}

function recordSentJobs(jobs) {
  const history = getHistory();
  const now = new Date().toISOString();
  
  jobs.forEach(job => {
    if (!history.sentJobIds.includes(job.id)) {
      history.sentJobIds.push(job.id);
    }
  });

  history.jobLogs.unshift({
    timestamp: now,
    count: jobs.length,
    jobs: jobs.map(j => ({ id: j.id, title: j.title, company: j.company, matchScore: j.matchScore, applyUrl: j.applyUrl }))
  });

  // Keep last 100 log entries
  if (history.jobLogs.length > 100) {
    history.jobLogs = history.jobLogs.slice(0, 100);
  }

  saveHistory(history);
}

module.exports = {
  getConfig,
  saveConfig,
  getHistory,
  saveHistory,
  recordSentJobs
};
