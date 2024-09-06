const express = require('express');
const { oAuth2Client, saveTokens } = require('./googleAuth');
const app = express();
const port = 8081;

// Endpoint to start OAuth2 flow
app.get('/auth/google', (req, res) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/youtube.upload'],
  });
  res.redirect(authUrl);
});

// Callback endpoint to handle authorization code
app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code;
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    saveTokens(tokens);
    res.send('Authorization successful! You can close this tab.');
  } catch (error) {
    console.error('Error during OAuth2 callback:', error);
    res.status(500).send('Failed to authenticate. Please try again.');
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Auth server running on http://localhost:${port}`);
});
