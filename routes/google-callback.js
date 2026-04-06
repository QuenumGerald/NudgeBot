const { Router } = require('express');
const { google } = require('googleapis');

const router = Router();

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

function getOAuthClient(clientId, clientSecret) {
  const redirectURL = process.env.APP_URL
    ? `${process.env.APP_URL}/api/auth/google/callback`
    : `http://localhost:${process.env.PORT || 3000}/api/auth/google/callback`;

  return new google.auth.OAuth2(clientId, clientSecret, redirectURL);
}

// Step 1: Redirect to Google consent screen
router.get('/google', async (req, res) => {
  try {
    const { getSetting } = require('../lib/db');
    const clientId = await getSetting('google_client_id');
    const clientSecret = await getSetting('google_client_secret');

    if (!clientId || !clientSecret) {
      return res.redirect('/settings?error=google_missing_credentials');
    }

    const oauth2Client = getOAuthClient(clientId, clientSecret);
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent', // Force refresh_token to be returned
    });

    res.redirect(url);
  } catch (err) {
    console.error('[Google OAuth] Error generating auth URL:', err);
    res.redirect('/settings?error=google_auth_failed');
  }
});

// Step 2: Handle callback, exchange code for tokens
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.redirect('/settings?error=google_no_code');
  }

  try {
    const { getSetting, setSetting } = require('../lib/db');
    const clientId = await getSetting('google_client_id');
    const clientSecret = await getSetting('google_client_secret');

    if (!clientId || !clientSecret) {
      return res.redirect('/settings?error=google_missing_credentials');
    }

    const oauth2Client = getOAuthClient(clientId, clientSecret);
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      // This happens if the user already authorized before — revoke and re-authorize
      return res.redirect('/settings?error=google_no_refresh_token&hint=revoke_and_retry');
    }

    await setSetting('google_refresh_token', tokens.refresh_token);
    if (tokens.access_token) {
      await setSetting('google_access_token', tokens.access_token);
    }

    console.log('[Google OAuth] Refresh token saved successfully');
    res.redirect('/settings?success=google_connected');
  } catch (err) {
    console.error('[Google OAuth] Token exchange error:', err);
    res.redirect('/settings?error=google_token_failed');
  }
});

module.exports = router;
