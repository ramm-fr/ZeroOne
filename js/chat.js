/* ===== Chat / Messaging ===== */
let chats = {};
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
  const unsub = db.collection('chats')
    .where('members', 'array-contains', currentUser.uid)
    .orderBy('lastActivity', 'desc')
    .onSnapshot(snap => {
      chats = {};
      snap.docs.forEach(d => { chats[d.id] = { id: d.id, ...d.data() }; });
      renderChatList();
      updateUnreadBadge();
    }, e => console.error('chats listener:', e));
  unsubscribers.push(unsub);
}

function renderChatList() {
  const list = document.getElementById('chat-list');
  if (!list) return;
  const chatArr = Object.values(chats);
  if (chatArr.length === 0) {
    list.innerHTML = '<div class="empty-state" style="padding:32px 16px"><div class="empty-icon"><i data-lucide="message-square" style="width:24px;height:24px"></i></div><div class="empty-title">No chats yet</div><div class="empty-desc">Start a new conversation</div></div>';
    lucide.createIcons({ nodes: [list] });
    return;
  }
  list.innerHTML = chatArr.map(chat => {
    const isGroup = chat.type === 'group';
    const other = isGroup ? null : (chat.memberData || []).find(m => m.uid !== currentUser.uid);
    const name = isGroup ? (chat.name || 'Group') : (other?.displayName || 'Unknown');
    const initials = getInitials(name);
    const lastMsg = chat.lastMessage || '';
    const unread = (chat.unreadCount || {})[currentUser.uid] || 0;
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
  }).join('');
  lucide.createIcons({ nodes: [list] });
  // Subscribe to presence for each contact
  chatArr.forEach(chat => {
    if (chat.type !== 'group') {
      const other = (chat.memberData || []).find(m => m.uid !== currentUser.uid);
      if (other) watchPresence(other.uid);
    }
  });
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

function filterChats(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.chat-item').forEach(el => {
    const name = el.querySelector('.chat-item-name')?.textContent.toLowerCase() || '';
    el.style.display = name.includes(q) ? '' : 'none';
  });
}

async function openChat(chatId) {
  activeChat = chatId;
  activeChatData = chats[chatId];
  // Mark as read
  markChatRead(chatId);
  // Update UI
  document.getElementById('chat-empty')?.classList.add('hidden');
  document.getElementById('chat-view')?.classList.remove('hidden');
  // Update active state in list
  document.querySelectorAll('.chat-item').forEach(el => {
    el.classList.toggle('active', el.dataset.chatId === chatId);
  });
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
  // Attach context menu listeners
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
  // Check if chat already exists
  const existing = Object.values(chats).find(c => c.type === 'direct' && c.members.includes(uid) && c.members.includes(currentUser.uid));
  if (existing) { openChat(existing.id); return; }
  try {
    const meData = { uid: currentUser.uid, displayName: currentUserData?.displayName || currentUser.displayName || 'Me', photoURL: currentUserData?.photoURL || '' };
    const themData = { uid, displayName: name, photoURL: photo };
    const chatRef = await db.collection('chats').add({
      type: 'direct',
      members: [currentUser.uid, uid],
      memberData: [meData, themData],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
      lastMessage: '',
      unreadCount: {}
    });
    openChat(chatRef.id);
  } catch (e) { showToast('Failed to start chat', 'error'); }
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
