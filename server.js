const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const storage = require('./services/storage');
const jobFetcher = require('./services/jobFetcher');
const resumeMatcher = require('./services/resumeMatcher');
const emailNotifier = require('./services/emailNotifier');
const scheduler = require('./services/scheduler');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// MIME types for static assets
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

// HTTP Server Logic
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // --- REST API ENDPOINTS ---
  if (pathname.startsWith('/api/')) {
    try {
      // 1. GET /api/config
      if (pathname === '/api/config' && req.method === 'GET') {
        const config = storage.getConfig();
        return sendJson(res, 200, { success: true, config });
      }

      // 2. POST /api/config (Update settings/profile)
      if (pathname === '/api/config' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const currentConfig = storage.getConfig();

        if (body.userProfile) {
          currentConfig.userProfile = { ...currentConfig.userProfile, ...body.userProfile };
        }
        if (body.emailConfig) {
          currentConfig.emailConfig = { ...currentConfig.emailConfig, ...body.emailConfig };
        }
        if (body.settings) {
          currentConfig.settings = { ...currentConfig.settings, ...body.settings };
        }

        storage.saveConfig(currentConfig);

        // Restart scheduler if interval changed
        if (body.settings && currentConfig.settings.activeScheduler) {
          scheduler.startScheduler(currentConfig.settings.cronIntervalMinutes || 60);
        }

        return sendJson(res, 200, { success: true, message: 'Configuration saved successfully', config: currentConfig });
      }

      // 3. POST /api/resume/extract (Extract skills from text)
      if (pathname === '/api/resume/extract' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const text = body.resumeText || '';
        const currentConfig = storage.getConfig();

        const extractedSkills = resumeMatcher.extractSkills(text, currentConfig.userProfile.skills || []);
        currentConfig.userProfile.resumeText = text;
        currentConfig.userProfile.skills = extractedSkills;

        storage.saveConfig(currentConfig);

        return sendJson(res, 200, {
          success: true,
          extractedSkills,
          message: `Extracted ${extractedSkills.length} skills from resume`
        });
      }

      // 4. GET /api/jobs/live (Fetch live matching jobs preview)
      if (pathname === '/api/jobs/live' && req.method === 'GET') {
        const config = storage.getConfig();
        const history = storage.getHistory();
        const sentIds = new Set(history.sentJobIds || []);

        const rawJobs = await jobFetcher.fetchAllLiveJobs(
          config.userProfile.skills,
          config.settings.jsearchApiKey
        );

        const rankedJobs = resumeMatcher.rankAndFilterJobs(
          rawJobs,
          config.userProfile,
          config.settings.minMatchPercentage || 40
        );

        // Mark previously sent jobs
        const responseJobs = rankedJobs.map(job => ({
          ...job,
          alreadyEmailed: sentIds.has(job.id)
        }));

        return sendJson(res, 200, {
          success: true,
          totalFetched: rawJobs.length,
          matchedCount: rankedJobs.length,
          jobs: responseJobs
        });
      }

      // 5. POST /api/trigger (Instant Email Trigger)
      if (pathname === '/api/trigger' && req.method === 'POST') {
        console.log('Manual notification trigger received from UI.');
        const result = await scheduler.executeJobCycle();
        return sendJson(res, 200, { success: true, result });
      }

      // 6. GET /api/status (Scheduler status & last run)
      if (pathname === '/api/status' && req.method === 'GET') {
        const status = scheduler.getStatus();
        return sendJson(res, 200, { success: true, status });
      }

      // 7. GET /api/history (Logs & past sent jobs)
      if (pathname === '/api/history' && req.method === 'GET') {
        const history = storage.getHistory();
        return sendJson(res, 200, { success: true, history });
      }

      return sendJson(res, 404, { success: false, error: 'API Endpoint not found' });
    } catch (err) {
      console.error('API Error:', err);
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // --- STATIC FILE SERVING ---
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Security check for directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'text/plain';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Fallback to index.html for SPA routing
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (indexErr, indexContent) => {
          if (indexErr) {
            res.writeHead(404);
            res.end('File not found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
            res.end(indexContent);
          }
        });
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

// Initialize & Start Server
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Job Alert Notification Tool is running!`);
  console.log(`🌐 Dashboard UI: http://localhost:${PORT}`);
  console.log(`====================================================`);

  // Start background hourly scheduler
  const config = storage.getConfig();
  if (config.settings.activeScheduler !== false) {
    scheduler.startScheduler(config.settings.cronIntervalMinutes || 60);
  }
});
