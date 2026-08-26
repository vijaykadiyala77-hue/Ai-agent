/**
 * DevAgent.ai – Frontend Logic v2
 * No n8n. No webhooks. Direct FastAPI /api/chat integration.
 */

document.addEventListener('DOMContentLoaded', () => {
  // ── Backend Config ───────────────────────────────────────────────────────
  // Set this to your deployed FastAPI backend URL, e.g.
  // 'https://devagent-backend.onrender.com'
  // Leave as '' only if the backend is served from the SAME domain as this frontend.
  const API_BASE = 'https://YOUR-BACKEND-URL.onrender.com';

  // ── State ────────────────────────────────────────────────────────────────
  let conversations       = [];
  let activeConversationId = null;
  let activeController    = null;   // AbortController for current request
  let isRequestActive     = false;  // prevent duplicate requests
  let simulatedStepsTimer = [];
  let pendingAction       = null;   // stores the action waiting for confirmation

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const sidebar           = document.getElementById('sidebar');
  const mobileMenuBtn     = document.getElementById('mobile-menu-btn');
  const mobileCloseBtn    = document.getElementById('mobile-close-btn');
  const newChatBtn        = document.getElementById('new-chat-btn');
  const conversationsList = document.getElementById('conversations-list');
  const clearChatBtn      = document.getElementById('clear-chat-btn');

  const messagesArea      = document.getElementById('messages-area');
  const welcomeContainer  = document.getElementById('welcome-container');
  const agentPulse        = document.getElementById('agent-pulse');
  const agentStatusLabel  = document.getElementById('agent-status-label');
  const webhookBanner     = document.getElementById('webhook-banner');
  const bannerText        = document.getElementById('banner-text');
  const progressContainer = document.getElementById('progress-container');
  const chatTextarea      = document.getElementById('chat-textarea');
  const stopBtn           = document.getElementById('stop-btn');
  const sendBtn           = document.getElementById('send-btn');
  const toastContainer    = document.getElementById('toast-container');

  // Sidebar dynamic labels
  const githubOwnerEl     = document.getElementById('github-owner');
  const githubRepoEl      = document.getElementById('github-repo');
  const aiModelLabelEl    = document.getElementById('ai-model-label');
  const githubStatusBadge = document.getElementById('github-status-badge');
  const githubStatusText  = document.getElementById('github-status-text');
  const repoDisplayEl     = document.getElementById('repo-display');
  const repoLink          = document.getElementById('github-repo-link');

  // Confirmation modal
  const confirmModal      = document.getElementById('confirm-modal');
  const confirmModalTitle = document.getElementById('confirm-modal-title');
  const confirmModalDesc  = document.getElementById('confirm-modal-desc');
  const confirmModalClose = document.getElementById('confirm-modal-close');
  const confirmFilePath   = document.getElementById('confirm-file-path');
  const confirmCommitMsg  = document.getElementById('confirm-commit-msg');
  const confirmCancelBtn  = document.getElementById('confirm-cancel-btn');
  const confirmCommitBtn  = document.getElementById('confirm-commit-btn');

  // ── Init ──────────────────────────────────────────────────────────────────
  initApp();

  async function initApp() {
    await checkBackendStatus();

    const storedConv = localStorage.getItem('conversations');
    if (storedConv) {
      try { conversations = JSON.parse(storedConv); } catch { conversations = []; }
    }

    renderConversationsList();

    if (conversations.length > 0) {
      loadConversation(conversations[conversations.length - 1].id);
    } else {
      startNewConversation();
    }

    chatTextarea.focus();
  }

  async function checkBackendStatus() {
    try {
      const res = await fetch(`${API_BASE}/api/status`);
      if (!res.ok) throw new Error('not ok');
      const data = await res.json();

      const ready = data.geminiConfigured && data.githubConfigured;

      // Update sidebar info
      if (githubOwnerEl)    githubOwnerEl.textContent    = data.githubOwner || '—';
      if (githubRepoEl)     githubRepoEl.textContent     = data.githubRepo  || '—';
      if (aiModelLabelEl)   aiModelLabelEl.textContent   = data.model       || '—';

      if (repoDisplayEl)
        repoDisplayEl.textContent = `${data.githubOwner}/${data.githubRepo}`;
      if (repoLink)
        repoLink.href = `https://github.com/${data.githubOwner}/${data.githubRepo}`;

      if (ready) {
        setGitHubBadge(true);
        webhookBanner.classList.add('hidden');
      } else {
        setGitHubBadge(false);
        const missing = [];
        if (!data.geminiConfigured)  missing.push('GEMINI_API_KEY');
        if (!data.githubConfigured)  missing.push('GITHUB_TOKEN');
        bannerText.textContent = `Backend missing: ${missing.join(', ')}. Check your .env file.`;
        webhookBanner.classList.remove('hidden');
      }
    } catch {
      setGitHubBadge(false);
      bannerText.textContent = 'Backend not reachable. Run: cd backend && python main.py';
      webhookBanner.classList.remove('hidden');
    }
  }

  function setGitHubBadge(connected) {
    if (!githubStatusBadge) return;
    if (connected) {
      githubStatusBadge.style.background  = 'rgba(52, 211, 153, 0.1)';
      githubStatusBadge.style.color       = 'var(--success-color)';
      githubStatusText.textContent        = 'Connected';
    } else {
      githubStatusBadge.style.background  = 'rgba(248, 113, 113, 0.1)';
      githubStatusBadge.style.color       = 'var(--error-color)';
      githubStatusText.textContent        = 'Disconnected';
    }
  }

  // ── Event Listeners ───────────────────────────────────────────────────────

  chatTextarea.addEventListener('input', () => {
    chatTextarea.style.height = 'auto';
    chatTextarea.style.height = chatTextarea.scrollHeight + 'px';
    sendBtn.disabled = !chatTextarea.value.trim() || isRequestActive;
  });

  chatTextarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);
  stopBtn.addEventListener('click', abortRequest);
  newChatBtn.addEventListener('click', startNewConversation);
  clearChatBtn.addEventListener('click', clearAllConversations);

  mobileMenuBtn.addEventListener('click', () => sidebar.classList.add('open'));
  mobileCloseBtn.addEventListener('click', () => sidebar.classList.remove('open'));

  document.querySelectorAll('.suggested-prompt-card').forEach(card => {
    card.addEventListener('click', () => {
      chatTextarea.value = card.getAttribute('data-prompt');
      chatTextarea.style.height = 'auto';
      chatTextarea.style.height = chatTextarea.scrollHeight + 'px';
      sendBtn.disabled = false;
      chatTextarea.focus();
    });
  });

  // Confirmation modal
  confirmModalClose.addEventListener('click', closeConfirmModal);
  confirmCancelBtn.addEventListener('click',  closeConfirmModal);
  confirmModal.addEventListener('click', e => { if (e.target === confirmModal) closeConfirmModal(); });
  confirmCommitBtn.addEventListener('click', executeConfirmedAction);

  // ── Chat Actions ──────────────────────────────────────────────────────────

  function startNewConversation() {
    activeConversationId = 'conv_' + Date.now();
    conversations.push({ id: activeConversationId, title: 'New Conversation', messages: [] });
    saveConversations();
    renderConversationsList();
    loadConversation(activeConversationId);
  }

  function loadConversation(id) {
    activeConversationId = id;
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;

    document.querySelectorAll('.conversation-item').forEach(item =>
      item.classList.toggle('active', item.getAttribute('data-id') === id));

    messagesArea.innerHTML = '';
    if (conv.messages.length === 0) {
      messagesArea.appendChild(welcomeContainer);
      welcomeContainer.style.display = 'flex';
    } else {
      welcomeContainer.style.display = 'none';
      conv.messages.forEach(msg => appendMessageUI(msg.role, msg.content));
    }
    messagesArea.scrollTop = messagesArea.scrollHeight;
    sidebar.classList.remove('open');
  }

  function clearAllConversations() {
    if (!confirm('Clear all conversations?')) return;
    conversations = [];
    saveConversations();
    renderConversationsList();
    startNewConversation();
    showToast('All conversations cleared', 'info');
  }

  function deleteConversation(id, event) {
    event.stopPropagation();
    conversations = conversations.filter(c => c.id !== id);
    saveConversations();
    renderConversationsList();
    if (activeConversationId === id) {
      conversations.length > 0
        ? loadConversation(conversations[conversations.length - 1].id)
        : startNewConversation();
    }
  }

  function saveConversations() {
    localStorage.setItem('conversations', JSON.stringify(conversations));
  }

  function renderConversationsList() {
    conversationsList.innerHTML = '';
    if (conversations.length === 0) {
      conversationsList.innerHTML = '<div class="empty-history">No past conversations</div>';
      return;
    }
    conversations.forEach(c => {
      const item = document.createElement('div');
      item.className = `conversation-item${c.id === activeConversationId ? ' active' : ''}`;
      item.setAttribute('data-id', c.id);

      const title = document.createElement('span');
      title.className = 'conversation-title';
      title.textContent = c.title;

      const del = document.createElement('button');
      del.className = 'delete-conv-btn';
      del.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

      item.appendChild(title);
      item.appendChild(del);
      item.addEventListener('click', () => loadConversation(c.id));
      del.addEventListener('click', e => deleteConversation(c.id, e));
      conversationsList.appendChild(item);
    });
  }

  // ── Message Sending ───────────────────────────────────────────────────────

  async function sendMessage() {
    const rawMessage = chatTextarea.value.trim();
    if (!rawMessage || isRequestActive) return;

    // Hide welcome panel
    if (welcomeContainer.parentNode === messagesArea) {
      welcomeContainer.style.display = 'none';
      messagesArea.removeChild(welcomeContainer);
    }

    const conv = conversations.find(c => c.id === activeConversationId);
    if (conv) {
      conv.messages.push({ role: 'user', content: rawMessage });
      if (conv.messages.filter(m => m.role === 'user').length === 1) {
        conv.title = rawMessage.slice(0, 30) + (rawMessage.length > 30 ? '...' : '');
        renderConversationsList();
      }
      saveConversations();
    }

    appendMessageUI('user', rawMessage);
    chatTextarea.value = '';
    chatTextarea.style.height = 'auto';
    sendBtn.disabled = true;
    messagesArea.scrollTop = messagesArea.scrollHeight;

    // Prepare history (without the message just added)
    const history = conv
      ? conv.messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
      : [];

    isRequestActive = true;
    activeController = new AbortController();
    setAgentState(true);
    startProgressSimulation();

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: rawMessage, history }),
        signal: activeController.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${response.status}`);
      }

      const data = await response.json();
      stopProgressSimulation();
      setAgentState(false);

      const replyContent = data.response || '';

      if (conv) {
        conv.messages.push({ role: 'agent', content: replyContent });
        saveConversations();
      }
      appendMessageUI('agent', replyContent);
      messagesArea.scrollTop = messagesArea.scrollHeight;

      // If agent wants to write a file → show confirmation dialog
      if (data.pending_action) {
        pendingAction = data.pending_action;
        openConfirmModal(data.pending_action);
      } else {
        showToast('Agent finished!', 'success');
      }

    } catch (error) {
      stopProgressSimulation();
      setAgentState(false);

      let errMsg;
      if (error.name === 'AbortError') {
        errMsg = '*Request stopped by user.*';
        showToast('Request stopped', 'warning');
      } else {
        errMsg = `**Error**: ${error.message}\n\n*Make sure the backend is running: \`cd backend && python main.py\`*`;
        showToast('Request failed', 'error');
      }

      if (conv) {
        conv.messages.push({ role: 'agent', content: errMsg });
        saveConversations();
      }
      appendMessageUI('agent', errMsg);
      messagesArea.scrollTop = messagesArea.scrollHeight;
    } finally {
      isRequestActive = false;
      activeController = null;
      sendBtn.disabled = !chatTextarea.value.trim();
    }
  }

  function abortRequest() {
    if (activeController) activeController.abort();
  }

  // ── Confirmation Modal ────────────────────────────────────────────────────

  function openConfirmModal(action) {
    const labels = { create: '🆕 Create New File', update: '✏️ Update File', delete: '🗑️ Delete File' };
    confirmModalTitle.textContent = labels[action.action] || 'Confirm Action';
    confirmModalDesc.textContent  = `The agent wants to ${action.action} the file below in your GitHub repository.`;
    confirmFilePath.value         = action.file_path || '';
    confirmCommitMsg.value        = action.commit_message || `${action.action} ${action.file_path} via DevAgent.ai`;
    confirmModal.classList.remove('hidden');
  }

  function closeConfirmModal() {
    confirmModal.classList.add('hidden');
    pendingAction = null;
  }

  async function executeConfirmedAction() {
    if (!pendingAction) return;

    confirmCommitBtn.disabled = true;
    confirmCommitBtn.innerHTML = '<span>Committing…</span>';

    const payload = {
      action:         pendingAction.action,
      file_path:      confirmFilePath.value,
      content:        pendingAction.content,
      commit_message: confirmCommitMsg.value,
    };

    try {
      const res = await fetch(`${API_BASE}/api/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      closeConfirmModal();

      const conv = conversations.find(c => c.id === activeConversationId);
      if (conv) {
        conv.messages.push({ role: 'agent', content: data.response });
        saveConversations();
      }
      appendMessageUI('agent', data.response);
      messagesArea.scrollTop = messagesArea.scrollHeight;
      showToast('Committed to GitHub!', 'success');

    } catch (err) {
      showToast(`Commit failed: ${err.message}`, 'error');
    } finally {
      confirmCommitBtn.disabled = false;
      confirmCommitBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
        Confirm & Commit`;
    }
  }

  // ── Agent State ───────────────────────────────────────────────────────────

  function setAgentState(working) {
    agentPulse.className = working ? 'status-indicator working' : 'status-indicator idle';
    agentStatusLabel.textContent = working ? 'Agent: Processing...' : 'Agent: Idle';
    stopBtn.classList.toggle('hidden', !working);
    progressContainer.classList.toggle('hidden', !working);
  }

  // ── Progress Simulation ───────────────────────────────────────────────────

  function startProgressSimulation() {
    const steps = [
      { id: 'step-0', delay: 0 },
      { id: 'step-1', delay: 2000 },
      { id: 'step-2', delay: 6000 },
      { id: 'step-3', delay: 12000 },
    ];
    simulatedStepsTimer = [];
    steps.forEach((step, idx) => {
      const row = document.getElementById(step.id);
      if (!row) return;
      const dot = row.querySelector('.step-dot');
      row.className = 'step-row';
      dot.className = 'step-dot';

      const t = setTimeout(() => {
        for (let i = 0; i < idx; i++) {
          const prev = document.getElementById(steps[i].id);
          if (prev) { prev.className = 'step-row done'; prev.querySelector('.step-dot').className = 'step-dot done'; }
        }
        row.className = 'step-row active';
        dot.className = 'step-dot active';
      }, step.delay);
      simulatedStepsTimer.push(t);
    });
  }

  function stopProgressSimulation() {
    simulatedStepsTimer.forEach(clearTimeout);
    simulatedStepsTimer = [];
  }

  // ── Markdown Rendering ────────────────────────────────────────────────────

  function appendMessageUI(role, content) {
    const row    = document.createElement('div');
    row.className = `message-row ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.innerHTML = markdownToHtml(content);
    row.appendChild(bubble);
    messagesArea.appendChild(row);
    if (window.Prism) Prism.highlightAllUnder(bubble);
  }

  function markdownToHtml(md) {
    if (!md) return '';
    const codeBlocks = [];
    let html = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const id = codeBlocks.length;
      codeBlocks.push({ lang: lang || 'code', code });
      return `\n\n__CODE_BLOCK_${id}__\n\n`;
    });

    const lines = html.split('\n');
    let inList = false, listType = '', out = [];
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith('__CODE_BLOCK_') && line.endsWith('__')) {
        if (inList) { out.push(`</${listType}>`); inList = false; }
        out.push(line); continue;
      }
      if (line.startsWith('### ')) { out.push(`<h3>${esc(line.slice(4))}</h3>`); continue; }
      if (line.startsWith('## '))  { out.push(`<h2>${esc(line.slice(3))}</h2>`); continue; }
      if (line.startsWith('# '))   { out.push(`<h1>${esc(line.slice(2))}</h1>`); continue; }

      const ulM = line.match(/^[-*+]\s+(.+)/);
      if (ulM) {
        if (!inList || listType !== 'ul') { if (inList) out.push(`</${listType}>`); out.push('<ul>'); inList = true; listType = 'ul'; }
        out.push(`<li>${inline(esc(ulM[1]))}</li>`); continue;
      }
      const olM = line.match(/^(\d+)\.\s+(.+)/);
      if (olM) {
        if (!inList || listType !== 'ol') { if (inList) out.push(`</${listType}>`); out.push('<ol>'); inList = true; listType = 'ol'; }
        out.push(`<li>${inline(esc(olM[2]))}</li>`); continue;
      }

      if (line === '') { if (inList) { out.push(`</${listType}>`); inList = false; } continue; }

      if (inList) { out.push(`</${listType}>`); inList = false; }

      if (/^(STATUS|SUMMARY|FILES|TESTING|ERRORS|GITHUB):/.test(line)) {
        const [k, ...rest] = line.split(':');
        out.push(`<div class="status-summary-box"><div class="summary-heading">${k}</div><div class="summary-item">${inline(esc(rest.join(':').trim()))}</div></div>`);
      } else {
        out.push(`<p>${inline(esc(line))}</p>`);
      }
    }
    if (inList) out.push(`</${listType}>`);
    html = out.join('\n');

    codeBlocks.forEach(({ lang, code }, id) => {
      const escapedCode = esc(code);
      html = html.replace(`__CODE_BLOCK_${id}__`, `
        <div class="code-block-container">
          <div class="code-block-header">
            <span class="code-lang-label">${lang}</span>
            <button class="copy-code-btn" onclick="window.copyCode(this)">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span>Copy</span>
            </button>
          </div>
          <pre><code class="language-${lang}">${escapedCode}</code></pre>
        </div>`);
    });
    return html;
  }

  function inline(t) {
    return t
      .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([\s\S]+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  }
  function esc(t) {
    return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Copy Code ─────────────────────────────────────────────────────────────
  window.copyCode = function(btn) {
    const code = btn.closest('.code-block-container').querySelector('code');
    navigator.clipboard.writeText(code.textContent).then(() => {
      const lbl = btn.querySelector('span');
      lbl.textContent = 'Copied!';
      btn.style.color = 'var(--success-color)';
      setTimeout(() => { lbl.textContent = 'Copy'; btn.style.color = ''; }, 2000);
    });
  };

  // ── Toast ─────────────────────────────────────────────────────────────────
  function showToast(message, type = 'info') {
    const icons = {
      success: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--success-color)" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>',
      error:   '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--error-color)"   stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      warning: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--warning-color)" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>',
      info:    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--text-secondary)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `${icons[type] || ''}<span class="toast-text">${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 50);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3500);
  }
});