/**
 * DevAgent.ai - Secure Proxy Backend Server
 */

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Serve Frontend Static Files
app.use(express.static(path.join(__dirname)));

// API Route: Check Status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    webhookConfigured: !!N8N_WEBHOOK_URL,
    githubConfig: {
      owner: 'vijaykadiyala77-hue',
      repo: 'n8n-coding-agent'
    }
  });
});

// API Route: Secure Webhook Proxy Chat
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'The "message" parameter is required in the request body.'
    });
  }

  if (!N8N_WEBHOOK_URL || N8N_WEBHOOK_URL === 'YOUR_N8N_WEBHOOK_URL') {
    return res.status(500).json({
      error: 'Configuration Error',
      message: 'N8N_WEBHOOK_URL environment variable is not configured on the server.'
    });
  }

  try {
    console.log(`[Proxy] Forwarding coding request to n8n: "${message.slice(0, 50)}..."`);

    // Use Node.js built-in Fetch API (supported in Node 18+)
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message })
    });

    if (!response.ok) {
      throw new Error(`n8n webhook returned status ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[Proxy] Successfully received response from n8n.');

    // Normalize response formats
    let responseText = '';
    if (data && data.response) {
      responseText = data.response;
    } else if (data && data.message) {
      responseText = data.message;
    } else {
      responseText = typeof data === 'string' ? data : JSON.stringify(data);
    }

    return res.json({
      response: responseText,
      status: 'success'
    });

  } catch (error) {
    console.error('[Proxy Error] Webhook routing failed:', error.message);
    return res.status(502).json({
      error: 'Bad Gateway',
      message: 'Failed to communicate with the AI Coding Agent backend.',
      details: error.message
    });
  }
});

// Fallback to serve index.html for single page app routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` DevAgent.ai backend listening on port ${PORT}`);
  console.log(` Open: http://localhost:${PORT}`);
  console.log(` Webhook Target: ${N8N_WEBHOOK_URL ? N8N_WEBHOOK_URL : 'NOT CONFIGURED (Check .env)'}`);
  console.log(`==================================================`);
});
