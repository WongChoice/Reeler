const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');

// Load OAuth2 credentials from the JSON file
const credentialsPath = path.join(__dirname, 'credentials', 'client_secret.json');
const credentials = JSON.parse(fs.readFileSync(credentialsPath));

// Extract client ID, client secret, and redirect URIs
const { client_id, client_secret, redirect_uris } = credentials.web;

// Create OAuth2 client
const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0] // Redirect URI
);

// Function to save tokens (for example purposes, implement this)
function saveTokens(tokens) {
  fs.writeFileSync(path.join(__dirname, 'credentials', 'tokens.json'), JSON.stringify(tokens));
}

// Export OAuth2 client and saveTokens function
module.exports = { oAuth2Client, saveTokens };
