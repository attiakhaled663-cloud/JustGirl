
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const CLIENT_ID = process.env.KICK_CLIENT_ID;
const CLIENT_SECRET = process.env.KICK_CLIENT_SECRET;
const REDIRECT_URI = process.env.KICK_REDIRECT_URI || `http://localhost:${PORT}/auth/kick/callback`;

const KICK_AUTH = 'https://id.kick.com/oauth/authorize';
const KICK_TOKEN = 'https://id.kick.com/oauth/token';
const KICK_API = 'https://api.kick.com';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn('KICK_CLIENT_ID / KICK_CLIENT_SECRET are missing. OAuth will not work until .env is configured.');
}

app.set('trust proxy', 1);
app.use(express.json({limit: '100kb'}));
app.use(session({
  name: 'khaled_kick_sid',
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

// Serve the site files and assets from this folder.
app.use(express.static(path.join(__dirname, 'public')));

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function sha256Base64url(value) {
  return base64url(crypto.createHash('sha256').update(value).digest());
}

function randomString(bytes = 48) {
  return base64url(crypto.randomBytes(bytes));
}

async function kickTokenExchange(code, codeVerifier) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier
  });

  const r = await fetch(KICK_TOKEN, {
    method: 'POST',
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    body
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`Kick token exchange failed (${r.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function kickApi(accessToken, endpoint, options = {}) {
  const r = await fetch(`${KICK_API}${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      'accept': 'application/json',
      ...(options.body ? {'content-type': 'application/json'} : {}),
      'authorization': `Bearer ${accessToken}`
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await r.json().catch(() => ({}));
  return {r, data};
}

function requireKickAuth(req, res, next) {
  if (!req.session.kick || !req.session.kick.access_token) {
    return res.status(401).json({authenticated: false, error: 'Kick login required'});
  }
  next();
}

// Start official OAuth 2.1 Authorization Code + PKCE flow.
app.get('/auth/kick', (req, res) => {
  if (!CLIENT_ID) return res.status(500).send('KICK_CLIENT_ID is not configured.');

  const state = randomString(32);
  const verifier = randomString(64);
  const challenge = sha256Base64url(verifier);

  req.session.kickOAuth = {state, verifier, createdAt: Date.now()};
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'user:read channel:read',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });

  res.redirect(`${KICK_AUTH}?${params.toString()}`);
});

app.get('/auth/kick/callback', async (req, res) => {
  try {
    const {code, state, error} = req.query;
    const pending = req.session.kickOAuth;

    if (error) throw new Error(`Kick authorization error: ${error}`);
    if (!code || !state || !pending || pending.state !== state) {
      throw new Error('Invalid OAuth state or callback.');
    }

    const token = await kickTokenExchange(code, pending.verifier);
    delete req.session.kickOAuth;

    req.session.kick = {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      token_type: token.token_type,
      expires_in: token.expires_in,
      scope: token.scope,
      obtained_at: Date.now()
    };

    res.redirect('/');
  } catch (err) {
    console.error(err);
    delete req.session.kickOAuth;
    res.status(400).send('Kick OAuth failed. Check the server log and your Redirect URL in Kick Developer.');
  }
});

app.get('/auth/kick/logout', (req, res) => {
  delete req.session.kick;
  res.redirect('/');
});

app.get('/api/kick/me', requireKickAuth, async (req, res) => {
  try {
    const {r, data} = await kickApi(req.session.kick.access_token, '/public/v1/users');
    if (!r.ok) {
      return res.status(r.status).json({authenticated: false, error: data?.message || 'Kick API error'});
    }
    res.json({authenticated: true, user: Array.isArray(data?.data) ? data.data[0] : data?.data});
  } catch (err) {
    res.status(502).json({authenticated: false, error: err.message});
  }
});

// Public channel lookup through the official API.
app.get('/api/kick/channels', requireKickAuth, async (req, res) => {
  try {
    const usernames = String(req.query.usernames || '').trim();
    if (!usernames) return res.status(400).json({error: 'usernames is required'});

    const qs = new URLSearchParams({slug: usernames});
    const {r, data} = await kickApi(req.session.kick.access_token, `/public/v1/channels?${qs.toString()}`);
    res.status(r.status).json(data);
  } catch (err) {
    res.status(502).json({error: err.message});
  }
});

// NOTE:
// This server intentionally does not expose a bulk/looping chat endpoint.
// Kick's developer terms prohibit bots that send spam or deceptive messages.
// Add only a user-confirmed, rate-limited chat action that matches your approved use case.
app.get('/api/kick/status', (req, res) => {
  res.json({
    oauthConfigured: Boolean(CLIENT_ID && CLIENT_SECRET),
    authenticated: Boolean(req.session.kick?.access_token),
    redirectUri: REDIRECT_URI
  });
});

app.listen(PORT, () => {
  console.log(`Khaled Hallowen Kick backend: http://localhost:${PORT}`);
  console.log(`Kick Redirect URI: ${REDIRECT_URI}`);
});
