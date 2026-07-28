/**
 * Strict Native Android Resume Matcher with Custom Location & Mode Rules
 * Role: Native Android ONLY
 * Stack: Kotlin & Java
 * Location Rules:
 *   1. Worldwide / Global -> Remote ONLY
 *   2. India (All States/Cities) -> Full-Time, Office/On-site, Hybrid, AND Remote
 */

function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s.#+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSkills(resumeText, defaultSkills = []) {
  return ['Kotlin', 'Java', 'Android', 'Jetpack Compose', 'MVVM', 'Clean Architecture', 'Hilt', 'Koin', 'Coroutines', 'Flow', 'Room', 'BLE'];
}

function matchJobAgainstResume(job, userProfile) {
  const jobTitleNorm = normalizeText(job.title);
  const jobDescNorm = normalizeText(job.description);
  const jobLocNorm = normalizeText(job.location);
  const jobTagsNorm = (job.tags || []).map(t => normalizeText(String(t))).join(' ');
  const fullText = `${jobTitleNorm} ${jobTagsNorm} ${jobDescNorm} ${jobLocNorm}`;

  // 1. STRICT ROLE FILTER: TITLE MUST BE ANDROID / KOTLIN ONLY!
  const isAndroidTitle = jobTitleNorm.includes('android') || jobTitleNorm.includes('kotlin');
  
  if (!isAndroidTitle) {
    job.matchScore = 0; // REJECT NON-ANDROID ROLES
    return job;
  }

  // 2. LOCATION & WORK MODE MATRIX
  const isIndia = jobLocNorm.includes('india') || 
                  jobLocNorm.includes('bengaluru') || 
                  jobLocNorm.includes('bangalore') || 
                  jobLocNorm.includes('pune') || 
                  jobLocNorm.includes('hyderabad') || 
                  jobLocNorm.includes('mumbai') || 
                  jobLocNorm.includes('delhi') || 
                  jobLocNorm.includes('gurgaon') || 
                  jobLocNorm.includes('noida') || 
                  jobLocNorm.includes('ahmedabad') ||
                  fullText.includes('india');

  const isRemote = jobLocNorm.includes('remote') || 
                   jobLocNorm.includes('worldwide') || 
                   jobLocNorm.includes('global') || 
                   jobLocNorm.includes('anywhere') ||
                   fullText.includes('remote') ||
                   (job.jobType || '').toLowerCase().includes('remote');

  // Rule 1: Worldwide / Global -> Remote ONLY
  // Rule 2: India -> Full-Time, Office, Hybrid, AND Remote
  if (!isIndia && !isRemote) {
    job.matchScore = 0; // Reject non-remote jobs located outside India (e.g. US on-site or Europe on-site)
    return job;
  }

  // 3. CORE TECH STACK SCORE (Kotlin & Java)
  const hasKotlin = fullText.includes('kotlin');
  const hasJava = fullText.includes('java');

  let skillScore = 30;
  const matchedSkills = [];

  if (hasKotlin) {
    skillScore += 20;
    matchedSkills.push('KOTLIN');
  }
  if (hasJava) {
    skillScore += 15;
    matchedSkills.push('JAVA');
  }

  const extraAndroidStack = ['jetpack compose', 'mvvm', 'clean architecture', 'hilt', 'koin', 'coroutines', 'flow', 'room', 'ble'];
  extraAndroidStack.forEach(st => {
    if (fullText.includes(st)) {
      skillScore += 5;
      matchedSkills.push(st.toUpperCase());
    }
  });

  const totalScore = Math.min(100, Math.round(30 + skillScore + 10));

  job.matchScore = totalScore;
  job.matchedSkills = Array.from(new Set(matchedSkills));
  job.locationFormatted = isIndia ? `📍 India (${job.location})` : `🌍 Worldwide Remote (${job.location})`;
  job.workModeTag = isIndia ? (isRemote ? 'India Remote' : 'India On-site/Hybrid/Full-time') : 'Worldwide Remote';

  return job;
}

function rankAndFilterJobs(jobs, userProfile, minScore = 35) {
  const scoredJobs = jobs
    .map(job => matchJobAgainstResume(job, userProfile))
    .filter(job => job.matchScore >= minScore);

  // Sort descending by match score
  scoredJobs.sort((a, b) => b.matchScore - a.matchScore);

  return scoredJobs;
}

module.exports = {
  extractSkills,
  matchJobAgainstResume,
  rankAndFilterJobs
};
