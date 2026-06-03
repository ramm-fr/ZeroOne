/* ===== Groups ===== */
let groups = {};
let selectedGroupMembers = [];

function loadGroups() {
  if (!currentUser) return;
  const unsub = db.collection('chats')
    .where('type', '==', 'group')
    .where('members', 'array-contains', currentUser.uid)
    .orderBy('lastActivity', 'desc')
    .onSnapshot(snap => {
      groups = {};
      snap.docs.forEach(d => { groups[d.id] = { id: d.id, ...d.data() }; });
      renderGroupList();
    }, e => console.error('groups:', e));
  unsubscribers.push(unsub);
}

function renderGroupList() {
  const list = document.getElementById('groups-list');
  if (!list) return;
  const arr = Object.values(groups);
  if (!arr.length) {
    list.innerHTML = `<div class="empty-state" style="padding:32px 16px">
      <div class="empty-icon"><i data-lucide="users-round" style="width:24px;height:24px"></i></div>
      <div class="empty-title">No groups</div>
      <div class="empty-desc">Create a group to collaborate</div>
    </div>`;
    lucide.createIcons({ nodes: [list] });
    return;
  }
  list.innerHTML = arr.map(g => `
    <div class="chat-item" onclick="openGroupChat('${g.id}')">
      <div class="avatar avatar-md" style="background:${stringToColor(g.name||'')}22;color:${stringToColor(g.name||'')}">${getInitials(g.name||'G')}</div>
      <div class="chat-item-info">
        <div class="chat-item-name">${g.name || 'Group'}</div>
        <div class="chat-item-preview">${(g.members||[]).length} members · ${g.lastMessage || 'No messages yet'}</div>
      </div>
      <div class="chat-item-meta">
        <span class="chat-item-time">${formatTime(g.lastActivity)}</span>
      </div>
    </div>`).join('');
  lucide.createIcons({ nodes: [list] });
}

function openGroupChat(chatId) {
  openChat(chatId);
  navigate('messages');
}

function openCreateGroupModal() {
  selectedGroupMembers = [];
  document.getElementById('modal-create-group').classList.remove('hidden');
  document.getElementById('group-name').value = '';
  document.getElementById('group-member-search').value = '';
  document.getElementById('group-member-results').innerHTML = '';
  document.getElementById('group-selected-members').innerHTML = '';
  lucide.createIcons();
}

async function searchGroupMembers(q) {
  const results = document.getElementById('group-member-results');
  if (!q.trim()) { results.innerHTML = ''; return; }
  try {
    const snap = await db.collection('users').where('displayName', '>=', q).where('displayName', '<=', q + '\uf8ff').limit(8).get();
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.id !== currentUser.uid);
    results.innerHTML = users.map(u => `
    <div class="chat-item" onclick="toggleGroupMember('${u.id}','${u.displayName}')">
      <div class="avatar avatar-sm" style="background:${stringToColor(u.displayName)}22;color:${stringToColor(u.displayName)}">${getInitials(u.displayName)}</div>
      <div class="chat-item-info"><div class="chat-item-name">${u.displayName}</div></div>
      ${selectedGroupMembers.some(m => m.uid === u.id) ? '<i data-lucide="check-circle" style="width:16px;height:16px;color:var(--green)"></i>' : ''}
    </div>`).join('');
    lucide.createIcons({ nodes: [results] });
  } catch (e) {}
}

function toggleGroupMember(uid, name) {
  const idx = selectedGroupMembers.findIndex(m => m.uid === uid);
  if (idx >= 0) {
    selectedGroupMembers.splice(idx, 1);
  } else {
    selectedGroupMembers.push({ uid, displayName: name });
  }
  renderSelectedMembers();
  searchGroupMembers(document.getElementById('group-member-search').value);
}

function renderSelectedMembers() {
  const container = document.getElementById('group-selected-members');
  if (!container) return;
  container.innerHTML = selectedGroupMembers.map(m => `
    <div style="display:flex;align-items:center;gap:5px;background:var(--accent-dim);border-radius:20px;padding:4px 10px;font-size:12px;font-weight:500;color:var(--accent)">
      ${m.displayName}
      <span onclick="toggleGroupMember('${m.uid}','${m.displayName}')" style="cursor:pointer;opacity:0.7;margin-left:2px">✕</span>
    </div>`).join('');
}

async function createGroup() {
  const name = document.getElementById('group-name').value.trim();
  if (!name) return showToast('Enter a group name', 'error');
  if (selectedGroupMembers.length === 0) return showToast('Add at least one member', 'error');
  try {
    const meData = { uid: currentUser.uid, displayName: currentUserData?.displayName || 'Me', photoURL: currentUserData?.photoURL || '' };
    const membersData = [meData, ...selectedGroupMembers.map(m => ({ uid: m.uid, displayName: m.displayName, photoURL: '' }))];
    const chatRef = await db.collection('chats').add({
      type: 'group',
      name,
      members: [currentUser.uid, ...selectedGroupMembers.map(m => m.uid)],
      memberData: membersData,
      createdBy: currentUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
      lastMessage: '',
      unreadCount: {}
    });
    closeModal('modal-create-group');
    showToast(`Group "${name}" created`, 'success');
    openGroupChat(chatRef.id);
  } catch (e) { showToast('Failed to create group', 'error'); }
}
