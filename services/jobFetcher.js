/**
 * Multi-Source Native Android Job Fetcher Service with In-Memory Caching.
 * Integrates JSearch (search-v2 API), RemoteOK, Remotive, Himalayas, WeWorkRemotely RSS.
 */

let cachedJSearchJobs = [];
let lastJSearchFetchTime = 0;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache

async function fetchJSearchJobs(query = 'Android Developer', apiKey = '') {
  if (!apiKey) return [];
  try {
    const url = `https://jsearch.p.rapidapi.com/search-v2?query=${encodeURIComponent(query)}&num_pages=1&date_posted=all`;
    const res = await fetch(url, {
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': 'jsearch.p.rapidapi.com',
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) return [];
    const data = await res.json();
    
    const rawJobs = (data.data && data.data.jobs) ? data.data.jobs : (Array.isArray(data.data) ? data.data : []);

    return rawJobs.map(item => ({
      id: `jsearch_${item.job_id}`,
      source: 'JSearch (LinkedIn/Indeed/Glassdoor)',
      title: item.job_title || 'Android Developer',
      company: item.employer_name || 'Tech Enterprise',
      location: item.job_is_remote ? 'Remote (Worldwide)' : `${item.job_city || ''} ${item.job_country || ''}`.trim() || 'India / Hybrid',
      jobType: item.job_employment_type || 'Full-time / Contract',
      tags: ['android', 'kotlin', item.job_employment_type || 'mobile'],
      description: item.job_description || '',
      applyUrl: item.job_apply_link || item.job_google_link || item.employer_website || `https://www.google.com/search?q=${encodeURIComponent(item.job_title + ' ' + item.employer_name)}`,
      postedAt: item.job_posted_at_datetime_utc || new Date().toISOString(),
      salary: item.job_min_salary ? `$${item.job_min_salary} - $${item.job_max_salary}` : 'Competitive'
    }));
  } catch (err) {
    console.error('JSearch Fetch Error:', err.message);
    return [];
  }
}

async function fetchRemoteOKJobs() {
  try {
    const res = await fetch('https://remoteok.com/api', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) JobAlertBot/10.0' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs = Array.isArray(data) ? data.slice(1) : [];
    
    return jobs.map(item => ({
      id: `remoteok_${item.id || item.slug}`,
      source: 'RemoteOK',
      title: item.position || item.title || 'Native Android Developer',
      company: item.company || 'Tech Company',
      location: item.location || 'Remote (Worldwide)',
      jobType: (item.tags || []).join(' ').toLowerCase().includes('contract') ? 'Contract' : 'Full-time / Remote',
      tags: item.tags || [],
      description: item.description || '',
      applyUrl: item.url || `https://remoteok.com/remote-jobs/${item.id}`,
      postedAt: item.date ? new Date(item.date).toISOString() : new Date().toISOString(),
      salary: item.salary_min ? `$${item.salary_min} - $${item.salary_max}` : 'Competitive'
    }));
  } catch (err) {
    console.error('RemoteOK Fetch Error:', err.message);
    return [];
  }
}

async function fetchRemotiveJobs(query = 'android') {
  try {
    const res = await fetch(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs = data.jobs || [];

    return jobs.map(item => ({
      id: `remotive_${item.id}`,
      source: 'Remotive',
      title: item.title,
      company: item.company_name,
      location: item.candidate_required_location || 'Worldwide Remote',
      jobType: (item.job_type || '').toLowerCase().includes('contract') ? 'Contract' : 'Full-time / Remote',
      tags: item.tags || [item.category],
      description: item.description || '',
      applyUrl: item.url,
      postedAt: item.publication_date ? new Date(item.publication_date).toISOString() : new Date().toISOString(),
      salary: item.salary || 'Competitive'
    }));
  } catch (err) {
    console.error('Remotive Fetch Error:', err.message);
    return [];
  }
}

async function fetchHimalayasJobs(query = 'android') {
  try {
    const res = await fetch(`https://himalayas.app/jobs/api?q=${encodeURIComponent(query)}&limit=100`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs = data.jobs || [];

    return jobs.map(item => ({
      id: `himalayas_${item.id || item.slug}`,
      source: 'Himalayas',
      title: item.title || item.position,
      company: item.companyName || item.company,
      location: item.locationRestrictions ? item.locationRestrictions.join(', ') : 'Worldwide Remote',
      jobType: item.employmentType || 'Remote',
      tags: item.categories || [],
      description: item.excerpt || item.description || '',
      applyUrl: item.applicationLink || item.url,
      postedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      salary: item.parentSalaryRange || 'Market Standard'
    }));
  } catch (err) {
    console.error('Himalayas Fetch Error:', err.message);
    return [];
  }
}

async function fetchWeWorkRemotelyJobs() {
  try {
    const res = await fetch('https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return [];
    const xml = await res.text();

    const items = xml.split('<item>').slice(1);
    const jobs = [];

    items.forEach((itemXml, index) => {
      const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || itemXml.match(/<title>(.*?)<\/title>/);
      const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
      const descMatch = itemXml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || itemXml.match(/<description>(.*?)<\/description>/);
      const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);

      if (titleMatch && linkMatch) {
        const fullTitle = titleMatch[1];
        const parts = fullTitle.split(':');
        const company = parts.length > 1 ? parts[0].trim() : 'WeWorkRemotely Employer';
        const title = parts.length > 1 ? parts.slice(1).join(':').trim() : fullTitle;

        jobs.push({
          id: `wwr_${index}`,
          source: 'WeWorkRemotely',
          title: title,
          company: company,
          location: 'Remote (Global)',
          jobType: 'Full-time / Remote',
          tags: ['programming', 'mobile', 'android'],
          description: descMatch ? descMatch[1] : title,
          applyUrl: linkMatch[1],
          postedAt: pubDateMatch ? new Date(pubDateMatch[1]).toISOString() : new Date().toISOString(),
          salary: 'Competitive'
        });
      }
    });

    return jobs;
  } catch (err) {
    console.error('WeWorkRemotely Fetch Error:', err.message);
    return [];
  }
}

async function fetchAllLiveJobs(userSkills = [], apiKey = '') {
  const now = Date.now();
  if (cachedJSearchJobs.length > 0 && (now - lastJSearchFetchTime) < CACHE_TTL_MS) {
    return cachedJSearchJobs;
  }

  console.log('Fetching multi-query JSearch & live sources...');
  
  const [jsearch1, jsearch2, jsearch3, remoteOk, remotiveAndroid, himalayasAndroid, wwrJobs] = await Promise.all([
    fetchJSearchJobs('Android Developer', apiKey),
    fetchJSearchJobs('Kotlin Android Developer', apiKey),
    fetchJSearchJobs('Android Engineer India', apiKey),
    fetchRemoteOKJobs(),
    fetchRemotiveJobs('android'),
    fetchHimalayasJobs('android'),
    fetchWeWorkRemotelyJobs()
  ]);

  const combined = [...jsearch1, ...jsearch2, ...jsearch3, ...remoteOk, ...remotiveAndroid, ...himalayasAndroid, ...wwrJobs];
  
  // Deduplicate by Company + Title
  const uniqueMap = new Map();
  combined.forEach(job => {
    const key = `${job.company}_${job.title}`.toLowerCase();
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, job);
    }
  });

  const result = Array.from(uniqueMap.values());
  if (result.length > 0) {
    cachedJSearchJobs = result;
    lastJSearchFetchTime = now;
  }

  return result;
}

module.exports = {
  fetchAllLiveJobs,
  fetchJSearchJobs,
  fetchRemoteOKJobs,
  fetchRemotiveJobs,
  fetchHimalayasJobs,
  fetchWeWorkRemotelyJobs
};
