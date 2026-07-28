const fs = require('fs');
const path = require('path');

/**
 * Format relative / friendly date
 */
function formatDate(dateStr) {
  if (!dateStr) return 'Recently';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffHours = Math.floor((now - d) / (1000 * 60 * 60));
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch (e) {
    return 'Recently';
  }
}

/**
 * Generates clean, crisp WHITE theme HTML email template
 */
function buildHtmlEmail(userProfile, jobs) {
  // Limit to top 8 jobs for a clean, short, and scannable email
  const displayJobs = jobs.slice(0, 8);

  const jobCardsHtml = displayJobs.map(job => {
    const scoreColor = job.matchScore >= 75 ? '#059669' : '#2563eb';
    const scoreBg = job.matchScore >= 75 ? '#d1fae5' : '#dbeafe';
    const postedDate = formatDate(job.postedAt);

    // Extract domain or clean company site
    let companySite = job.applyUrl ? new URL(job.applyUrl).hostname.replace('www.', '') : job.company;

    return `
    <div style="background-color: #ffffff; border-radius: 10px; padding: 16px 18px; margin-bottom: 14px; border: 1px solid #e2e8f0; border-left: 4px solid ${job.matchScore >= 75 ? '#10b981' : '#6366f1'}; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
        <h3 style="margin: 0; color: #0f172a; font-size: 16px; font-weight: 700;">${job.title}</h3>
        <span style="background-color: ${scoreBg}; color: ${scoreColor}; padding: 3px 10px; border-radius: 12px; font-weight: 700; font-size: 12px; font-family: monospace; white-space: nowrap; margin-left: 10px;">
          ${job.matchScore}% Match
        </span>
      </div>

      <div style="color: #475569; font-size: 13px; margin-bottom: 10px; line-height: 1.5;">
        🏢 <strong style="color: #1e293b;">${job.company}</strong> &nbsp;•&nbsp; 
        📍 ${job.locationFormatted || job.location} &nbsp;•&nbsp; 
        📅 ${postedDate}
      </div>

      ${job.matchedSkills && job.matchedSkills.length > 0 ? `
        <div style="margin-bottom: 12px; display: flex; flex-wrap: wrap; gap: 4px;">
          ${job.matchedSkills.map(skill => `<span style="background-color: #f1f5f9; color: #4338ca; border: 1px solid #e2e8f0; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; margin-right: 4px;">${skill}</span>`).join('')}
        </div>
      ` : ''}

      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-top: 10px; border-top: 1px solid #f1f5f9;">
        <a href="${job.applyUrl}" target="_blank" style="background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 7px 18px; border-radius: 6px; font-weight: 600; font-size: 12px; display: inline-block;">
          Apply Now 🚀
        </a>
        <span style="color: #64748b; font-size: 11px;">🌐 ${companySite}</span>
      </div>
    </div>
    `;
  }).join('');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>Android Jobs Alert for ${userProfile.name}</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 20px;">
    <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
      
      <!-- Header -->
      <div style="padding-bottom: 16px; border-bottom: 2px solid #4f46e5; margin-bottom: 20px;">
        <h2 style="color: #4f46e5; margin: 0; font-size: 22px; font-weight: 700;">⚡ JobAlert AI &nbsp;|&nbsp; Native Android</h2>
        <p style="color: #64748b; font-size: 13px; margin: 6px 0 0 0;">
          Top <strong>${displayJobs.length} Native Android Jobs</strong> (Kotlin/Java • Worldwide Remote & India)
        </p>
      </div>

      <!-- Jobs List -->
      <div>
        ${jobCardsHtml}
      </div>

      <!-- Footer -->
      <div style="text-align: center; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 16px; color: #94a3b8; font-size: 11px;">
        <span>Automated Native Android Digest for Chintan Prajapati</span>
      </div>

    </div>
  </body>
  </html>
  `;
}

/**
 * Send email via Resend API
 */
async function sendEmailViaResend(resendApiKey, recipientEmail, subject, htmlContent) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'JobAlert AI <onboarding@resend.dev>',
        to: [recipientEmail],
        subject: subject,
        html: htmlContent
      })
    });

    const data = await response.json();
    if (response.ok) {
      console.log('Resend Email Sent Successfully:', data.id);
      return { success: true, messageId: data.id };
    } else {
      console.error('Resend API Error:', data);
      return { success: false, error: data.message || 'Resend API error' };
    }
  } catch (err) {
    console.error('Resend Network Error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Main Dispatch Function
 */
async function sendEmailNotification(emailConfig, userProfile, jobs) {
  if (!jobs || jobs.length === 0) {
    return { success: false, message: 'No matching jobs found' };
  }

  const recipientEmail = emailConfig.recipient || userProfile.email || 'ctnprt@gmail.com';
  const htmlContent = buildHtmlEmail(userProfile, jobs);
  const subject = `🎯 ${Math.min(jobs.length, 8)} New Native Android Job Matches (Kotlin / Java)`;

  // 1. Check if Resend API Key is provided
  const resendApiKey = emailConfig.resendApiKey || process.env.RESEND_API_KEY;
  if (resendApiKey) {
    console.log(`Sending Email via Resend API to ${recipientEmail}...`);
    const resendResult = await sendEmailViaResend(resendApiKey, recipientEmail, subject, htmlContent);
    if (resendResult.success) {
      return { success: true, recipient: recipientEmail, message: 'Email sent via Resend API' };
    }
  }

  // 2. Fallback to Local Preview
  try {
    const previewDir = path.join(__dirname, '..', 'public', 'previews');
    if (!fs.existsSync(previewDir)) {
      fs.mkdirSync(previewDir, { recursive: true });
    }

    const filename = `email_preview_${Date.now()}.html`;
    const previewPath = path.join(previewDir, filename);

    fs.writeFileSync(previewPath, htmlContent, 'utf8');

    const previewUrl = `/previews/${filename}`;
    console.log(`Email Digest Generated for ${recipientEmail}: http://localhost:3000${previewUrl}`);

    return {
      success: true,
      demo: true,
      previewUrl: previewUrl,
      recipient: recipientEmail
    };
  } catch (err) {
    console.error('Email Generation Error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  buildHtmlEmail,
  sendEmailNotification,
  sendEmailViaResend
};
