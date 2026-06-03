/* ===== Chat / Messaging ===== */
let chats = {};
let chatRequests = {};          // pending message requests keyed by chatId
let activeChat = null;
let activeChatData = null;
let messagesListener = null;
let replyingTo = null;
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let selectedMsgId = null;
let allMessages = [];

function listenToChats() {
  if (!currentUser) return;

  // ── Accepted chats ────────────────────────────────────────────────────────
  const unsub1 = db.collection('chats')
    .where('members', 'array-contains', currentUser.uid)
    .where('status', '==', 'accepted')
    .orderBy('lastActivity', 'desc')
    .onSnapshot(snap => {
      chats = {};
      snap.docs.forEach(d => { chats[d.id] = { id: d.id, ...d.data() }; });
      renderChatList();
      updateUnreadBadge();
    }, e => console.error('chats listener:', e));

  // ── Pending requests (where I am the recipient) ───────────────────────────
  const unsub2 = db.collection('chats')
    .where('recipient', '==', currentUser.uid)
    .where('status', '==', 'pending')
    .orderBy('lastActivity', 'desc')
    .onSnapshot(snap => {
      chatRequests = {};
      snap.docs.forEach(d => { chatRequests[d.id] = { id: d.id, ...d.data() }; });
      renderChatList();
      updateUnreadBadge();
      updateRequestsBadge();
    }, e => console.error('requests listener:', e));

  unsubscribers.push(unsub1, unsub2);
}

function renderChatList() {
  const list = document.getElementById('chat-list');
  if (!list) return;

  const chatArr    = Object.values(chats);
  const requestArr = Object.values(chatRequests);

  // ── Empty state ────────────────────────────────────────────────────────────
  if (chatArr.length === 0 && requestArr.length === 0) {
    list.innerHTML = `
      <div class="empty-state" style="padding:32px 16px">
        <div class="empty-icon"><i data-lucide="message-square" style="width:24px;height:24px"></i></div>
        <div class="empty-title">No chats yet</div>
        <div class="empty-desc">Start a new conversation</div>
      </div>`;
    lucide.createIcons({ nodes: [list] });
    return;
  }

  // ── Message Requests banner ────────────────────────────────────────────────
  let html = '';
  if (requestArr.length > 0) {
    html += `
      <div class="requests-banner" onclick="showRequestsPanel()">
        <div class="requests-banner-left">
          <div class="requests-banner-icon">
            <i data-lucide="mail" style="width:18px;height:18px"></i>
          </div>
          <div>
            <div class="requests-banner-title">Message Requests</div>
            <div class="requests-banner-sub">${requestArr.length} pending request${requestArr.length > 1 ? 's' : ''}</div>
          </div>
        </div>
        <i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text-muted)"></i>
      </div>
      <div class="chat-list-divider">Chats</div>`;
  }

  // ── Accepted chats ─────────────────────────────────────────────────────────
  if (chatArr.length === 0) {
    html += `<div class="text-secondary text-sm text-center" style="padding:20px">No accepted chats yet</div>`;
  } else {
    html += chatArr.map(chat => renderChatItem(chat)).join('');
  }

  list.innerHTML = html;
  lucide.createIcons({ nodes: [list] });

  chatArr.forEach(chat => {
    if (chat.type !== 'group') {
      const other = (chat.memberData || []).find(m => m.uid !== currentUser.uid);
      if (other) watchPresence(other.uid);
    }
  });
}

function renderChatItem(chat) {
  const isGroup  = chat.type === 'group';
  const other    = isGroup ? null : (chat.memberData || []).find(m => m.uid !== currentUser.uid);
  const name     = isGroup ? (chat.name || 'Group') : (other?.displayName || 'Unknown');
  const initials = getInitials(name);
  const lastMsg  = chat.lastMessage || '';
  const unread   = (chat.unreadCount || {})[currentUser.uid] || 0;
  const isActive = activeChat === chat.id;
  return `
  <div class="chat-item ${isActive ? 'active' : ''}" onclick="openChat('${chat.id}')" data-chat-id="${chat.id}">
    <div class="avatar-wrap">
      <div class="avatar avatar-md" style="background:${stringToColor(name)}22;color:${stringToColor(name)}">${initials}</div>
      ${!isGroup ? `<span class="online-dot" id="dot-${other?.uid || ''}"></span>` : ''}
    </div>
    <div class="chat-item-info">
      <div class="chat-item-name">${name}</div>
      <div class="chat-item-preview">${lastMsg}</div>
    </div>
    <div class="chat-item-meta">
      <span class="chat-item-time">${formatTime(chat.lastActivity)}</span>
      ${unread > 0 ? `<span class="badge">${unread > 99 ? '99+' : unread}</span>` : ''}
    </div>
  </div>`;
}

function watchPresence(uid) {
  rtdb.ref(`presence/${uid}`).on('value', snap => {
    const data = snap.val() || {};
    const dot = document.getElementById(`dot-${uid}`);
    if (dot) {
      dot.className = `online-dot ${data.status === 'online' ? '' : data.status === 'busy' ? 'busy' : data.status === 'away' ? 'away' : 'offline'}`;
    }
  });
}

function updateUnreadBadge() {
  const total = Object.values(chats).reduce((sum, c) => sum + ((c.unreadCount || {})[currentUser?.uid] || 0), 0);
  const badge = document.getElementById('badge-messages');
  if (badge) badge.classList.toggle('hidden', total === 0);
}

function updateRequestsBadge() {
  const count = Object.values(chatRequests).length;
  // Show a dot on messages nav if there are pending requests
  const badge = document.getElementById('badge-messages');
  if (badge && count > 0) badge.classList.remove('hidden');
}

function filterChats(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.chat-item').forEach(el => {
    const name = el.querySelector('.chat-item-name')?.textContent.toLowerCase() || '';
    el.style.display = name.includes(q) ? '' : 'none';
  });
}

async function openChat(chatId) {
  activeChat = chatId;
  activeChatData = chats[chatId] || chatRequests[chatId];
  // Mark as read
  markChatRead(chatId);
  // Clear any request bar from a previous preview
  clearRequestBar();
  // Re-enable input
  const textarea = document.getElementById('msg-textarea');
  if (textarea) textarea.disabled = false;
  // Update UI
  document.getElementById('chat-empty')?.classList.add('hidden');
  document.getElementById('chat-view')?.classList.remove('hidden');
  // Update active state in list
  document.querySelectorAll('.chat-item').forEach(el => {
    el.classList.toggle('active', el.dataset.chatId === chatId);
  });
  // If this is still a pending request, show the bar
  if (activeChatData?.status === 'pending' && activeChatData?.recipient === currentUser.uid) {
    showRequestBar(chatId);
    const inputWrap = document.getElementById('msg-input-wrap');
    if (inputWrap) inputWrap.style.opacity = '0.4';
    if (textarea) textarea.disabled = true;
    document.getElementById('send-btn').disabled = true;
  }
  // Update header
  updateChatHeader();
  // Listen to messages
  if (messagesListener) messagesListener();
  messagesListener = db.collection('chats').doc(chatId).collection('messages')
    .orderBy('createdAt', 'asc')
    .onSnapshot(snap => {
      allMessages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderMessages(allMessages);
    });
  navigate('messages');
  lucide.createIcons();
}

function updateChatHeader() {
  if (!activeChatData) return;
  const isGroup = activeChatData.type === 'group';
  const other = isGroup ? null : (activeChatData.memberData || []).find(m => m.uid !== currentUser.uid);
  const name = isGroup ? (activeChatData.name || 'Group') : (other?.displayName || 'Unknown');
  const sub = isGroup ? `${(activeChatData.members || []).length} members` : (other?.email || '');
  document.getElementById('chat-header-name').textContent = name;
  document.getElementById('chat-header-sub').textContent = sub;
  const av = document.getElementById('chat-header-avatar');
  if (av) {
    av.textContent = getInitials(name);
    av.style.background = stringToColor(name) + '22';
    av.style.color = stringToColor(name);
  }
}

function renderMessages(msgs) {
  const area = document.getElementById('messages-area');
  if (!area) return;
  let html = '';
  let lastDate = null;

  // Show pending notice for the sender
  if (activeChatData?.status === 'pending' && activeChatData?.sender === currentUser.uid) {
    html += `
      <div class="pending-request-notice">
        <span>
          <i data-lucide="clock" style="width:13px;height:13px"></i>
          Message request sent — waiting for ${(activeChatData.memberData || []).find(m => m.uid !== currentUser.uid)?.displayName || 'them'} to accept
        </span>
      </div>`;
  }

  msgs.forEach((msg, idx) => {
    const msgDate = formatDate(msg.createdAt);
    if (msgDate !== lastDate) {
      html += `<div class="system-message"><span>${msgDate}</span></div>`;
      lastDate = msgDate;
    }
    html += renderMessageBubble(msg, idx, msgs);
  });
  area.innerHTML = html;
  lucide.createIcons({ nodes: [area] });
  area.scrollTop = area.scrollHeight;
  area.querySelectorAll('.message-bubble').forEach(el => {
    el.addEventListener('contextmenu', e => { e.preventDefault(); showMsgContextMenu(e, el.dataset.msgId); });
  });
}

function renderMessageBubble(msg, idx, msgs) {
  const isOwn = msg.senderId === currentUser.uid;
  const showAvatar = !isOwn && (idx === 0 || msgs[idx - 1]?.senderId !== msg.senderId);
  const senderName = msg.senderName || 'Unknown';
  let contentHTML = '';
  if (msg.type === 'image') {
    contentHTML = `<div class="message-img"><img src="${msg.fileURL}" alt="image" loading="lazy" onclick="openImageViewer('${msg.fileURL}')" /></div>`;
  } else if (msg.type === 'file') {
    contentHTML = `<div class="message-file" onclick="window.open('${msg.fileURL}','_blank')">
      <div class="file-icon"><i data-lucide="file" style="width:20px;height:20px"></i></div>
      <div><div class="file-name">${msg.fileName || 'File'}</div><div class="file-size">${formatFileSize(msg.fileSize || 0)}</div></div>
      <i data-lucide="download" style="width:16px;height:16px;margin-left:auto;color:var(--text-muted)"></i>
    </div>`;
  } else if (msg.type === 'voice') {
    contentHTML = `<div class="message-voice">
      <div class="voice-btn" onclick="playVoice('${msg.fileURL}',this)"><i data-lucide="play" style="width:14px;height:14px"></i></div>
      <div class="voice-waveform"><div class="voice-waveform-bars">${Array(16).fill(0).map(() => `<div class="voice-bar" style="height:${4 + Math.random()*16}px"></div>`).join('')}</div></div>
      <span class="voice-duration">${msg.duration || '0:00'}</span>
    </div>`;
  } else {
    const txt = (msg.text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
    contentHTML = `<div class="message-bubble" data-msg-id="${msg.id}">${msg.replyTo ? `<div style="border-left:2px solid var(--accent);padding-left:8px;margin-bottom:6px;font-size:12px;color:var(--text-secondary);opacity:0.8">${msg.replyTo.text || '...'}</div>` : ''}${txt}</div>`;
  }
  const reactions = msg.reactions ? Object.entries(msg.reactions).map(([emoji, uids]) =>
    `<div class="reaction ${uids.includes(currentUser.uid) ? 'own-reaction' : ''}" onclick="addReaction('${msg.id}','${emoji}')">
      ${emoji}<span class="reaction-count">${uids.length}</span>
    </div>`).join('') : '';
  return `
  <div class="message-group ${isOwn ? 'own' : ''}">
    ${showAvatar && !isOwn ? `<div class="msg-sender"><div class="avatar avatar-sm" style="background:${stringToColor(senderName)}22;color:${stringToColor(senderName)}">${getInitials(senderName)}</div><span class="msg-sender-name">${senderName}</span><span class="msg-sender-time">${formatFullTime(msg.createdAt)}</span></div>` : ''}
    ${contentHTML}
    ${reactions ? `<div class="message-reactions">${reactions}</div>` : ''}
    <div class="message-time">${formatFullTime(msg.createdAt)} ${isOwn ? (msg.read ? '✓✓' : '✓') : ''}</div>
  </div>`;
}

async function sendMessage() {
  if (!activeChat || !currentUser) return;
  const textarea = document.getElementById('msg-textarea');
  const text = textarea.value.trim();
  if (!text) return;
  textarea.value = '';
  textarea.style.height = 'auto';
  document.getElementById('send-btn').disabled = true;
  const msgData = {
    text,
    type: 'text',
    senderId: currentUser.uid,
    senderName: currentUserData?.displayName || currentUser.displayName || 'You',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    read: false,
    reactions: {}
  };
  if (replyingTo) {
    msgData.replyTo = { id: replyingTo.id, text: replyingTo.text, senderName: replyingTo.senderName };
    cancelReply();
  }
  try {
    await db.collection('chats').doc(activeChat).collection('messages').add(msgData);
    // Update chat metadata
    const other = activeChatData?.members?.filter(id => id !== currentUser.uid) || [];
    const unreadUpdate = {};
    other.forEach(uid => { unreadUpdate[`unreadCount.${uid}`] = firebase.firestore.FieldValue.increment(1); });
    await db.collection('chats').doc(activeChat).update({
      lastMessage: text.length > 60 ? text.slice(0, 60) + '…' : text,
      lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
      ...unreadUpdate
    });
    sendNotification(activeChat, text);
  } catch (e) { showToast('Failed to send message', 'error'); }
}

function handleMsgKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function handleMsgInput(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  const sendBtn = document.getElementById('send-btn');
  if (sendBtn) sendBtn.disabled = el.value.trim().length === 0;
  // Typing indicator
  if (activeChat && currentUser) {
    rtdb.ref(`typing/${activeChat}/${currentUser.uid}`).set(true);
    clearTimeout(window._typingTimer);
    window._typingTimer = setTimeout(() => {
      rtdb.ref(`typing/${activeChat}/${currentUser.uid}`).remove();
    }, 2000);
  }
}

async function markChatRead(chatId) {
  if (!currentUser) return;
  try {
    await db.collection('chats').doc(chatId).update({ [`unreadCount.${currentUser.uid}`]: 0 });
  } catch (e) {}
}

function cancelReply() {
  replyingTo = null;
  document.getElementById('reply-preview')?.classList.add('hidden');
}

function setReplyTo(msg) {
  replyingTo = msg;
  const preview = document.getElementById('reply-preview');
  if (preview) {
    preview.classList.remove('hidden');
    document.getElementById('reply-name').textContent = msg.senderName;
    document.getElementById('reply-text').textContent = msg.text || '[Media]';
  }
  document.getElementById('msg-textarea')?.focus();
}

// File uploads
function triggerFileUpload() {
  if (!activeChat) return showToast('Select a chat first', 'info');
  document.getElementById('file-input')?.click();
}

function triggerImageUpload() {
  if (!activeChat) return showToast('Select a chat first', 'info');
  document.getElementById('image-input')?.click();
}

async function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file || !activeChat) return;
  e.target.value = '';
  // Firestore doc limit is 1MB — only allow small files without Storage
  if (file.size > 900 * 1024) {
    return showToast('Free plan: files must be under 900KB. Upgrade to Blaze for larger files.', 'error');
  }
  showToast('Sending file…', 'info');
  try {
    // Read as base64 and embed directly in Firestore
    const base64 = await fileToBase64(file);
    const msgData = {
      type: 'file',
      fileName: file.name,
      fileSize: file.size,
      fileURL: base64,   // data URI — no Storage needed
      senderId: currentUser.uid,
      senderName: currentUserData?.displayName || 'You',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      read: false
    };
    await db.collection('chats').doc(activeChat).collection('messages').add(msgData);
    await db.collection('chats').doc(activeChat).update({
      lastMessage: `📎 ${file.name}`,
      lastActivity: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) { showToast('Failed to send file: ' + err.message, 'error'); }
}

async function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file || !activeChat) return;
  e.target.value = '';
  if (file.size > 5 * 1024 * 1024) return showToast('Image must be under 5MB', 'error');
  showToast('Sending image…', 'info');
  try {
    // Compress to max 600px wide, then store as base64 in Firestore
    const base64 = await compressImageToBase64(file, 600, 0.80);
    await db.collection('chats').doc(activeChat).collection('messages').add({
      type: 'image',
      fileURL: base64,   // data URI — no Storage needed
      senderId: currentUser.uid,
      senderName: currentUserData?.displayName || 'You',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      read: false
    });
    await db.collection('chats').doc(activeChat).update({
      lastMessage: '📷 Photo',
      lastActivity: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) { showToast('Failed to send image: ' + err.message, 'error'); }
}

// Voice recording
async function toggleVoiceRecording() {
  if (isRecording) {
    stopVoiceRecording();
  } else {
    startVoiceRecording();
  }
}

async function startVoiceRecording() {
  if (!activeChat) return showToast('Select a chat first', 'info');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      stream.getTracks().forEach(t => t.stop());
      await uploadVoiceMessage(blob);
    };
    mediaRecorder.start();
    isRecording = true;
    const btn = document.getElementById('voice-msg-btn');
    if (btn) { btn.style.color = 'var(--red)'; btn.title = 'Stop recording'; }
    showToast('Recording... click mic to stop', 'info');
  } catch (e) { showToast('Microphone access denied', 'error'); }
}

function stopVoiceRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  isRecording = false;
  const btn = document.getElementById('voice-msg-btn');
  if (btn) { btn.style.color = ''; btn.title = 'Voice message'; }
}

async function uploadVoiceMessage(blob) {
  try {
    // Convert blob → base64 and store in Firestore (no Storage needed)
    const base64 = await blobToBase64(blob);
    const durationSec = Math.round(audioChunks.length * 0.25); // rough estimate
    const mm = String(Math.floor(durationSec / 60)).padStart(2, '0');
    const ss = String(durationSec % 60).padStart(2, '0');
    await db.collection('chats').doc(activeChat).collection('messages').add({
      type: 'voice',
      fileURL: base64,   // data URI
      duration: `${mm}:${ss}`,
      senderId: currentUser.uid,
      senderName: currentUserData?.displayName || 'You',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      read: false
    });
    await db.collection('chats').doc(activeChat).update({
      lastMessage: '🎙️ Voice message',
      lastActivity: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) { showToast('Failed to send voice message', 'error'); }
}

let voiceAudio = null;
function playVoice(url, btn) {
  if (voiceAudio && !voiceAudio.paused) { voiceAudio.pause(); return; }
  voiceAudio = new Audio(url);
  voiceAudio.play();
  btn.innerHTML = '<i data-lucide="square" style="width:14px;height:14px"></i>';
  lucide.createIcons({ nodes: [btn] });
  voiceAudio.onended = () => {
    btn.innerHTML = '<i data-lucide="play" style="width:14px;height:14px"></i>';
    lucide.createIcons({ nodes: [btn] });
  };
}

// Emoji picker
const EMOJIS = ['😀','😂','😍','🤩','🥳','😎','🤔','😢','😡','👍','👎','❤️','🔥','⭐','🎉','✅','❌','💯','🙏','👋','💪','🤝','🚀','💡','📌','🔔','💬','📞','🎵','🌟'];

function toggleEmojiPicker() {
  const picker = document.getElementById('emoji-picker');
  if (!picker) return;
  if (picker.classList.contains('hidden')) {
    picker.innerHTML = '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
      EMOJIS.map(e => `<button style="font-size:22px;cursor:pointer;padding:4px;border-radius:6px;background:none;border:none;transition:all 0.15s" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''" onclick="insertEmoji('${e}')">${e}</button>`).join('') +
    '</div>';
    // Position picker near the emoji button
    const btn = document.getElementById('emoji-btn');
    const rect = btn.getBoundingClientRect();
    picker.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
    picker.style.right = (window.innerWidth - rect.right) + 'px';
    picker.classList.remove('hidden');
  } else {
    picker.classList.add('hidden');
  }
}

function insertEmoji(emoji) {
  const textarea = document.getElementById('msg-textarea');
  if (textarea) {
    const pos = textarea.selectionStart;
    textarea.value = textarea.value.slice(0, pos) + emoji + textarea.value.slice(pos);
    textarea.focus();
    document.getElementById('send-btn').disabled = false;
  }
  document.getElementById('emoji-picker')?.classList.add('hidden');
}

// Reactions
async function addReaction(msgId, emoji) {
  if (!activeChat || !currentUser) return;
  const ref = db.collection('chats').doc(activeChat).collection('messages').doc(msgId);
  const snap = await ref.get();
  const reactions = snap.data()?.reactions || {};
  const uids = reactions[emoji] || [];
  if (uids.includes(currentUser.uid)) {
    reactions[emoji] = uids.filter(id => id !== currentUser.uid);
    if (!reactions[emoji].length) delete reactions[emoji];
  } else {
    reactions[emoji] = [...uids, currentUser.uid];
  }
  await ref.update({ reactions });
}

// Context menu
function showMsgContextMenu(e, msgId) {
  selectedMsgId = msgId;
  const menu = document.getElementById('msg-context-menu');
  if (!menu) return;
  menu.style.top = e.clientY + 'px';
  menu.style.left = e.clientX + 'px';
  menu.classList.remove('hidden');
  lucide.createIcons({ nodes: [menu] });
}

function replyToMessage() {
  const msg = allMessages.find(m => m.id === selectedMsgId);
  if (msg) setReplyTo(msg);
  document.getElementById('msg-context-menu')?.classList.add('hidden');
}

function copyMessageText() {
  const msg = allMessages.find(m => m.id === selectedMsgId);
  if (msg?.text) { navigator.clipboard.writeText(msg.text); showToast('Copied', 'success'); }
  document.getElementById('msg-context-menu')?.classList.add('hidden');
}

function reactToMessage() {
  document.getElementById('msg-context-menu')?.classList.add('hidden');
  toggleEmojiPicker();
}

function forwardMessage() {
  showToast('Forward feature coming soon', 'info');
  document.getElementById('msg-context-menu')?.classList.add('hidden');
}

async function deleteMessage() {
  if (!selectedMsgId || !activeChat) return;
  document.getElementById('msg-context-menu')?.classList.add('hidden');
  try {
    await db.collection('chats').doc(activeChat).collection('messages').doc(selectedMsgId).delete();
    showToast('Message deleted', 'success');
  } catch (e) { showToast('Failed to delete', 'error'); }
}

// Open New Chat Modal
function openNewChat() {
  document.getElementById('modal-new-chat').classList.remove('hidden');
  document.getElementById('new-chat-search').value = '';
  document.getElementById('new-chat-results').innerHTML = '';
  lucide.createIcons();
  setTimeout(() => document.getElementById('new-chat-search')?.focus(), 100);
}

async function searchNewChatUsers(query) {
  const results = document.getElementById('new-chat-results');
  if (!query.trim() || !results) return (results.innerHTML = '');
  try {
    const [byName, byUsername] = await Promise.all([
      db.collection('users').where('displayName', '>=', query).where('displayName', '<=', query + '\uf8ff').limit(10).get(),
      db.collection('users').where('username', '>=', query.toLowerCase()).where('username', '<=', query.toLowerCase() + '\uf8ff').limit(5).get()
    ]);
    const seen = new Set();
    const users = [];
    [...byName.docs, ...byUsername.docs].forEach(d => {
      if (!seen.has(d.id) && d.id !== currentUser.uid) { seen.add(d.id); users.push({ id: d.id, ...d.data() }); }
    });
    if (!users.length) { results.innerHTML = '<div class="text-secondary text-sm text-center" style="padding:16px">No users found</div>'; return; }
    results.innerHTML = users.map(u => `
    <div class="chat-item" onclick="startDirectChat('${u.id}','${u.displayName}','${u.photoURL || ''}')">
      <div class="avatar avatar-md" style="background:${stringToColor(u.displayName)}22;color:${stringToColor(u.displayName)}">${getInitials(u.displayName)}</div>
      <div class="chat-item-info">
        <div class="chat-item-name">${u.displayName}</div>
        <div class="chat-item-preview">@${u.username || u.email}</div>
      </div>
    </div>`).join('');
  } catch (e) { results.innerHTML = '<div class="text-secondary text-sm text-center" style="padding:16px">Search error</div>'; }
}

async function startDirectChat(uid, name, photo) {
  closeModal('modal-new-chat');

  // Already have an accepted chat?
  const existing = Object.values(chats).find(
    c => c.type === 'direct' && c.members.includes(uid) && c.members.includes(currentUser.uid)
  );
  if (existing) { openChat(existing.id); return; }

  // Already sent a pending request?
  const pendingSnap = await db.collection('chats')
    .where('sender', '==', currentUser.uid)
    .where('recipient', '==', uid)
    .where('status', '==', 'pending')
    .limit(1).get();
  if (!pendingSnap.empty) {
    showToast('Message request already sent — waiting for acceptance', 'info');
    // Still open the chat so sender can see their sent message
    openChat(pendingSnap.docs[0].id);
    return;
  }

  // Check if they already sent us a request — if so, auto-accept
  const theirRequestSnap = await db.collection('chats')
    .where('sender', '==', uid)
    .where('recipient', '==', currentUser.uid)
    .where('status', '==', 'pending')
    .limit(1).get();
  if (!theirRequestSnap.empty) {
    await acceptRequest(theirRequestSnap.docs[0].id);
    return;
  }

  // Check if they are already a contact (contacts skip the request step)
  const contactSnap = await db.collection('users').doc(currentUser.uid)
    .collection('contacts').doc(uid).get();
  const isContact = contactSnap.exists;

  try {
    const meData   = { uid: currentUser.uid, displayName: currentUserData?.displayName || currentUser.displayName || 'Me', photoURL: currentUserData?.photoURL || '' };
    const themData = { uid, displayName: name, photoURL: photo };

    const chatRef = await db.collection('chats').add({
      type:         'direct',
      members:      [currentUser.uid, uid],
      memberData:   [meData, themData],
      sender:       currentUser.uid,
      recipient:    uid,
      // Contacts go straight to accepted; strangers are pending
      status:       isContact ? 'accepted' : 'pending',
      createdAt:    firebase.firestore.FieldValue.serverTimestamp(),
      lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
      lastMessage:  '',
      unreadCount:  {}
    });

    if (!isContact) {
      // Notify the recipient
      await createNotification(uid, 'message_request',
        `sent you a message request`, chatRef.id);
      showToast(`Message request sent to ${name}`, 'success');
    }

    openChat(chatRef.id);
  } catch (e) { showToast('Failed to start chat: ' + e.message, 'error'); }
}

// ── Request Actions ────────────────────────────────────────────────────────

async function acceptRequest(chatId) {
  try {
    await db.collection('chats').doc(chatId).update({ status: 'accepted' });
    // Notify sender their request was accepted
    const chat = chatRequests[chatId] || (await db.collection('chats').doc(chatId).get()).data();
    if (chat?.sender) {
      await createNotification(chat.sender, 'request_accepted',
        `accepted your message request`, chatId);
    }
    showToast('Request accepted', 'success');
    openChat(chatId);
    closeRequestsPanel();
  } catch (e) { showToast('Failed to accept: ' + e.message, 'error'); }
}

async function declineRequest(chatId) {
  try {
    await db.collection('chats').doc(chatId).update({ status: 'declined' });
    delete chatRequests[chatId];
    renderChatList();
    renderRequestsPanel();
    showToast('Request declined', 'info');
  } catch (e) { showToast('Failed to decline: ' + e.message, 'error'); }
}

async function blockRequest(chatId) {
  try {
    const chat = chatRequests[chatId] || {};
    const senderId = chat.sender;
    if (senderId) {
      // Add to blocked list in user's profile
      await db.collection('users').doc(currentUser.uid)
        .collection('blocked').doc(senderId).set({ blockedAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
    await db.collection('chats').doc(chatId).update({ status: 'blocked' });
    delete chatRequests[chatId];
    renderChatList();
    renderRequestsPanel();
    showToast('User blocked', 'info');
  } catch (e) { showToast('Failed to block: ' + e.message, 'error'); }
}

// ── Requests Panel ─────────────────────────────────────────────────────────

function showRequestsPanel() {
  const panel = document.getElementById('requests-panel');
  if (panel) {
    panel.classList.remove('hidden');
    renderRequestsPanel();
    lucide.createIcons({ nodes: [panel] });
  }
}

function closeRequestsPanel() {
  document.getElementById('requests-panel')?.classList.add('hidden');
}

function renderRequestsPanel() {
  const body = document.getElementById('requests-panel-body');
  if (!body) return;
  const requestArr = Object.values(chatRequests);
  if (!requestArr.length) {
    body.innerHTML = `
      <div class="empty-state" style="padding:48px 20px">
        <div class="empty-icon"><i data-lucide="mail-open" style="width:28px;height:28px"></i></div>
        <div class="empty-title">No message requests</div>
        <div class="empty-desc">When someone new messages you, it'll show up here</div>
      </div>`;
    lucide.createIcons({ nodes: [body] });
    return;
  }
  body.innerHTML = requestArr.map(req => {
    const sender = (req.memberData || []).find(m => m.uid !== currentUser.uid);
    const name   = sender?.displayName || 'Unknown';
    return `
    <div class="request-item" id="req-${req.id}">
      <div class="request-avatar-wrap">
        <div class="avatar avatar-lg" style="background:${stringToColor(name)}22;color:${stringToColor(name)}">${getInitials(name)}</div>
      </div>
      <div class="request-info">
        <div class="request-name">${name}</div>
        <div class="request-preview">${req.lastMessage || 'Wants to message you'}</div>
        <div class="request-time">${formatTime(req.lastActivity)}</div>
      </div>
      <div class="request-actions">
        <button class="btn btn-primary" style="font-size:13px;padding:7px 14px" onclick="previewRequest('${req.id}')">
          <i data-lucide="eye" style="width:14px;height:14px"></i>Preview
        </button>
        <button class="btn btn-green" style="font-size:13px;padding:7px 14px" onclick="acceptRequest('${req.id}')">
          <i data-lucide="check" style="width:14px;height:14px"></i>Accept
        </button>
        <button class="btn btn-danger" style="font-size:13px;padding:7px 14px" onclick="declineRequest('${req.id}')">
          <i data-lucide="x" style="width:14px;height:14px"></i>Decline
        </button>
        <button class="btn btn-ghost" style="font-size:13px;padding:7px 14px" onclick="blockRequest('${req.id}')">
          <i data-lucide="ban" style="width:14px;height:14px"></i>Block
        </button>
      </div>
    </div>`;
  }).join('');
  lucide.createIcons({ nodes: [body] });
}

// Preview a request's messages without accepting
async function previewRequest(chatId) {
  const req = chatRequests[chatId];
  if (!req) return;
  activeChatData = req;
  activeChat = chatId;
  // Update header
  document.getElementById('chat-empty')?.classList.add('hidden');
  document.getElementById('chat-view')?.classList.remove('hidden');
  updateChatHeader();
  // Show request action bar in the chat area
  showRequestBar(chatId);
  // Load messages (read-only preview)
  if (messagesListener) messagesListener();
  messagesListener = db.collection('chats').doc(chatId).collection('messages')
    .orderBy('createdAt', 'asc')
    .onSnapshot(snap => {
      allMessages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderMessages(allMessages);
    });
  // Disable input while in preview
  const inputArea = document.getElementById('msg-input-wrap');
  if (inputArea) inputArea.style.opacity = '0.4';
  document.getElementById('msg-textarea').disabled = true;
  document.getElementById('send-btn').disabled = true;
  closeRequestsPanel();
  navigate('messages');
}

function showRequestBar(chatId) {
  // Remove any existing bar
  document.getElementById('request-action-bar')?.remove();
  const bar = document.createElement('div');
  bar.id = 'request-action-bar';
  bar.className = 'request-action-bar';
  bar.innerHTML = `
    <div class="request-bar-info">
      <i data-lucide="shield-alert" style="width:18px;height:18px;color:var(--yellow)"></i>
      <span>This person isn't in your contacts. Review their message.</span>
    </div>
    <div class="request-bar-btns">
      <button class="btn btn-green" onclick="acceptRequest('${chatId}')">
        <i data-lucide="check" style="width:15px;height:15px"></i>Accept
      </button>
      <button class="btn btn-danger" onclick="declineRequest('${chatId}')">
        <i data-lucide="x" style="width:15px;height:15px"></i>Decline
      </button>
      <button class="btn btn-ghost" onclick="blockRequest('${chatId}')">
        <i data-lucide="ban" style="width:15px;height:15px"></i>Block
      </button>
    </div>`;
  const msgInputArea = document.querySelector('.message-input-area');
  if (msgInputArea) msgInputArea.parentNode.insertBefore(bar, msgInputArea);
  lucide.createIcons({ nodes: [bar] });
}

function clearRequestBar() {
  document.getElementById('request-action-bar')?.remove();
  const inputArea = document.getElementById('msg-input-wrap');
  if (inputArea) inputArea.style.opacity = '';
  const textarea = document.getElementById('msg-textarea');
  if (textarea) textarea.disabled = false;
}

// Toggle Info Panel
function toggleInfoPanel() {
  const panel = document.getElementById('info-panel');
  if (!panel) return;
  panel.classList.toggle('collapsed');
  if (!panel.classList.contains('collapsed')) renderInfoPanel();
}

function renderInfoPanel() {
  const body = document.getElementById('info-panel-body');
  if (!body || !activeChatData) return;
  const isGroup = activeChatData.type === 'group';
  const members = activeChatData.memberData || [];
  const membersHTML = isGroup ? `
    <div class="info-section">
      <div class="info-section-title">Members (${members.length})</div>
      ${members.map(m => `<div class="member-item">
        <div class="avatar avatar-sm" style="background:${stringToColor(m.displayName)}22;color:${stringToColor(m.displayName)}">${getInitials(m.displayName)}</div>
        <div class="member-name">${m.displayName}</div>
        ${m.uid === activeChatData.createdBy ? '<span class="member-role">Admin</span>' : ''}
      </div>`).join('')}
    </div>` : '';
  const photos = allMessages.filter(m => m.type === 'image').slice(-9);
  body.innerHTML = `
    <div class="info-section">
      <div class="info-section-title">Shared Media</div>
      ${photos.length ? `<div class="info-media-grid">${photos.map(p => `<div class="info-media-thumb"><img src="${p.fileURL}" alt=""/></div>`).join('')}</div>` : '<div class="text-secondary text-sm">No shared media</div>'}
    </div>
    ${membersHTML}
    <div class="info-section">
      <div class="info-section-title">Actions</div>
      <div class="dropdown-item danger" onclick="leaveChatConfirm()" style="border-radius:8px"><i data-lucide="log-out" style="width:15px;height:15px"></i> ${isGroup ? 'Leave Group' : 'Delete Chat'}</div>
    </div>`;
  lucide.createIcons({ nodes: [body] });
}

async function leaveChatConfirm() {
  if (!confirm('Are you sure?')) return;
  try {
    if (activeChatData?.type === 'group') {
      await db.collection('chats').doc(activeChat).update({ members: firebase.firestore.FieldValue.arrayRemove(currentUser.uid) });
    } else {
      await db.collection('chats').doc(activeChat).delete();
    }
    activeChat = null;
    activeChatData = null;
    document.getElementById('chat-empty')?.classList.remove('hidden');
    document.getElementById('chat-view')?.classList.add('hidden');
    document.getElementById('info-panel')?.classList.add('collapsed');
    showToast('Done', 'success');
  } catch (e) { showToast('Failed', 'error'); }
}

// Open image full-screen
function openImageViewer(url) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;cursor:zoom-out';
  overlay.innerHTML = `<img src="${url}" style="max-width:90vw;max-height:90vh;border-radius:8px;object-fit:contain"/>`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

function openChatMenu() { showToast('More options coming soon', 'info'); }

function sendNotification(chatId, text) {
  // Browser notification
  if (Notification?.permission === 'granted') {
    const other = activeChatData?.memberData?.find(m => m.uid !== currentUser.uid);
    new Notification('ZeroOne', { body: text, icon: 'favicon.ico' });
  }
}
