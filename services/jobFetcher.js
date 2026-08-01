/**
 * Multi-Source Native Android Job Fetcher Service with In-Memory Caching.
 * Integrates JSearch (search-v2 API), RemoteOK, Remotive, Himalayas, WeWorkRemotely RSS.
 * Environment Variable Support: JSEARCH_API_KEY, RESEND_API_KEY.
 */

let cachedJSearchJobs = {}; // keyed by query
let lastJSearchFetchTime = {}; // keyed by query
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache

let cachedCombinedJobs = [];
let lastCombinedFetchTime = 0;

async function fetchJSearchJobs(query = 'Android Developer', apiKey = '') {
  const activeKey = apiKey || process.env.JSEARCH_API_KEY || '';
  if (!activeKey) return [];

  const now = Date.now();
  if (cachedJSearchJobs[query] && (now - lastJSearchFetchTime[query]) < CACHE_TTL_MS) {
    return cachedJSearchJobs[query];
  }

  try {
    const url = `https://jsearch.p.rapidapi.com/search-v2?query=${encodeURIComponent(query)}&num_pages=1&date_posted=all`;
    const res = await fetch(url, {
      headers: {
        'x-rapidapi-key': activeKey,
        'x-rapidapi-host': 'jsearch.p.rapidapi.com',
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) return cachedJSearchJobs[query] || [];
    const data = await res.json();
    
    const rawJobs = (data.data && data.data.jobs) ? data.data.jobs : (Array.isArray(data.data) ? data.data : []);

    if (rawJobs.length > 0) {
      cachedJSearchJobs[query] = rawJobs.map(item => ({
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
      lastJSearchFetchTime[query] = now;
    }

    return cachedJSearchJobs[query] || [];
  } catch (err) {
    console.error('JSearch Fetch Error:', err.message);
    return cachedJSearchJobs[query] || [];
  }
}

async function fetchRemoteOKJobs() {
  try {
    const res = await fetch('https://remoteok.com/api', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) JobAlertBot/11.0' }
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
    const res = await fetch(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(query)}&limit=100`, {
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
    const [mobileRes, contractRes] = await Promise.all([
      fetch('https://weworkremotely.com/categories/remote-mobile-app-dev-jobs.rss', { headers: { 'User-Agent': 'Mozilla/5.0' } }),
      fetch('https://weworkremotely.com/categories/remote-contract-jobs.rss', { headers: { 'User-Agent': 'Mozilla/5.0' } })
    ]);

    const xmls = await Promise.all([
      mobileRes.ok ? mobileRes.text() : '',
      contractRes.ok ? contractRes.text() : ''
    ]);

    const jobs = [];

    xmls.forEach(xml => {
      if (!xml) return;
      const items = xml.split('<item>').slice(1);
      
      items.forEach(itemXml => {
        const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || itemXml.match(/<title>(.*?)<\/title>/);
        const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
        const descMatch = itemXml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || itemXml.match(/<description>(.*?)<\/description>/);
        const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);

        if (titleMatch && linkMatch) {
          const fullTitle = titleMatch[1];
          const parts = fullTitle.split(':');
          const company = parts.length > 1 ? parts[0].trim() : 'WeWorkRemotely Employer';
          const title = parts.length > 1 ? parts.slice(1).join(':').trim() : fullTitle;
          
          const link = linkMatch[1];
          // Extract slug to form a stable unique ID
          const slug = link.split('/').pop().split('?')[0].replace(/[^a-zA-Z0-9-]/g, '_');
          const uniqueId = `wwr_${slug}`;

          jobs.push({
            id: uniqueId,
            source: 'WeWorkRemotely',
            title: title,
            company: company,
            location: 'Remote (Global)',
            jobType: 'Remote',
            tags: ['programming', 'mobile', 'android'],
            description: descMatch ? descMatch[1] : title,
            applyUrl: link,
            postedAt: pubDateMatch ? new Date(pubDateMatch[1]).toISOString() : new Date().toISOString(),
            salary: 'Competitive'
          });
        }
      });
    });

    return jobs;
  } catch (err) {
    console.error('WeWorkRemotely Fetch Error:', err.message);
    return [];
  }
}
async function fetchHackerNewsJobs() {
  try {
    // 1. Fetch the latest "Who is hiring" story ID
    const storyRes = await fetch('https://hn.algolia.com/api/v1/search?tags=story,author_whoishiring&hitsPerPage=1');
    if (!storyRes.ok) return [];
    const storyData = await storyRes.json();
    if (!storyData.hits || storyData.hits.length === 0) return [];
    
    const storyId = storyData.hits[0].objectID;
    const storyTitle = storyData.hits[0].title || 'HN Who is hiring';

    // 2. Fetch comments containing "android" or "kotlin" under this story ID
    const [androidRes, kotlinRes] = await Promise.all([
      fetch(`https://hn.algolia.com/api/v1/search?tags=comment,story_${storyId}&query=android&hitsPerPage=30`),
      fetch(`https://hn.algolia.com/api/v1/search?tags=comment,story_${storyId}&query=kotlin&hitsPerPage=30`)
    ]);

    const androidHits = androidRes.ok ? (await androidRes.json()).hits || [] : [];
    const kotlinHits = kotlinRes.ok ? (await kotlinRes.json()).hits || [] : [];

    const combinedHits = [...androidHits, ...kotlinHits];

    // Deduplicate by comment objectID
    const uniqueHitsMap = new Map();
    combinedHits.forEach(hit => {
      uniqueHitsMap.set(hit.objectID, hit);
    });

    const parsedJobs = [];
    uniqueHitsMap.forEach(item => {
      let cleanText = item.comment_text || '';
      // Strip HTML tags to get a clean snippet
      let snippet = cleanText
        .replace(/<p>/g, '\n')
        .replace(/<br>/g, '\n')
        .replace(/<\/?[^>]+(>|$)/g, '')
        .trim();

      // Extract details from first line (typically Company | Title | Location)
      const lines = snippet.split('\n');
      const firstLine = lines[0] || 'Hacker News Job Post';
      const parts = firstLine.split('|').map(p => p.trim());
      
      const company = parts[0] || 'HN Startup';
      const title = parts[1] || 'Android Engineer';
      const location = parts[2] || 'Remote / ONSITE';
      const workMode = parts[3] || 'Flexible';

      parsedJobs.push({
        id: `hn_${item.objectID}`,
        source: `Hacker News (Who is Hiring - ${storyTitle})`,
        title: title,
        company: company,
        location: `${location} (${workMode})`.trim(),
        jobType: 'Contract / Full-time',
        tags: ['hn', 'startup', 'android', 'kotlin'],
        description: snippet,
        applyUrl: `https://news.ycombinator.com/item?id=${item.objectID}`,
        postedAt: item.created_at || new Date().toISOString(),
        salary: 'Competitive'
      });
    });

    return parsedJobs;
  } catch (err) {
    console.error('Hacker News Fetch Error:', err.message);
    return [];
  }
}


async function fetchAllLiveJobs(userSkills = []) {
  const now = Date.now();
  if (cachedCombinedJobs.length > 0 && (now - lastCombinedFetchTime) < CACHE_TTL_MS) {
    return cachedCombinedJobs;
  }

  console.log('Fetching live sources...');
  
  const [remoteOk, remotiveAndroid, himalayasAndroid, wwrJobs, hnJobs] = await Promise.all([
    fetchRemoteOKJobs(),
    fetchRemotiveJobs('android'),
    fetchHimalayasJobs('android'),
    fetchWeWorkRemotelyJobs(),
    fetchHackerNewsJobs()
  ]);

  const combined = [...remoteOk, ...remotiveAndroid, ...himalayasAndroid, ...wwrJobs, ...hnJobs];
  
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
    cachedCombinedJobs = result;
    lastCombinedFetchTime = now;
  }

  return result;
}

module.exports = {
  fetchAllLiveJobs,
  fetchJSearchJobs,
  fetchRemoteOKJobs,
  fetchRemotiveJobs,
  fetchHimalayasJobs,
  fetchWeWorkRemotelyJobs,
  fetchHackerNewsJobs
};
