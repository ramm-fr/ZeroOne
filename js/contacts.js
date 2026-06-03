/* ===== Contacts ===== */
let allContacts = [];

async function loadContacts() {
  if (!currentUser) return;
  try {
    const snap = await db.collection('users').doc(currentUser.uid).collection('contacts').get();
    const contactIds = snap.docs.map(d => d.id);
    if (!contactIds.length) { renderContacts([]); return; }
    // Fetch user docs in batches
    const batches = [];
    for (let i = 0; i < contactIds.length; i += 10) {
      batches.push(db.collection('users').where('uid', 'in', contactIds.slice(i, i + 10)).get());
    }
    const results = await Promise.all(batches);
    allContacts = results.flatMap(r => r.docs.map(d => ({ id: d.id, ...d.data() })));
    renderContacts(allContacts);
  } catch (e) { console.error('loadContacts:', e); }
}

function renderContacts(contacts) {
  const grid = document.getElementById('contacts-grid');
  if (!grid) return;
  if (!contacts.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:48px">
      <div class="empty-icon"><i data-lucide="users" style="width:32px;height:32px"></i></div>
      <div class="empty-title">No contacts yet</div>
      <div class="empty-desc">Add contacts to start chatting</div>
      <button class="btn btn-primary" onclick="openAddContactModal()"><i data-lucide="user-plus" style="width:16px;height:16px"></i>Add Contact</button>
    </div>`;
    lucide.createIcons({ nodes: [grid] });
    return;
  }
  grid.innerHTML = contacts.map(c => `
    <div class="contact-card">
      <div class="avatar-wrap">
        <div class="avatar avatar-lg" style="background:${stringToColor(c.displayName)}22;color:${stringToColor(c.displayName)}">${getInitials(c.displayName)}</div>
        <span class="online-dot" id="cdot-${c.uid}"></span>
      </div>
      <div class="contact-name">${c.displayName}</div>
      <div class="contact-handle">@${c.username || '—'}</div>
      <div class="contact-status-text">${c.bio ? c.bio.slice(0, 50) : '—'}</div>
      <div class="contact-actions">
        <button class="btn btn-secondary" style="font-size:12px;padding:6px 12px" onclick="startDirectChat('${c.uid}','${c.displayName}','${c.photoURL||''}');navigate('messages')">
          <i data-lucide="message-square" style="width:14px;height:14px"></i>Chat
        </button>
        <button class="btn btn-ghost" style="font-size:12px;padding:6px 12px" onclick="callUser('${c.uid}','${c.displayName}','video')">
          <i data-lucide="video" style="width:14px;height:14px"></i>Call
        </button>
      </div>
    </div>`).join('');
  lucide.createIcons({ nodes: [grid] });
  contacts.forEach(c => watchPresence(c.uid));
}

function filterContacts(q) {
  const filtered = allContacts.filter(c => (c.displayName + c.username + c.email).toLowerCase().includes(q.toLowerCase()));
  renderContacts(filtered);
}

function openAddContactModal() {
  document.getElementById('modal-add-contact').classList.remove('hidden');
  document.getElementById('add-contact-query').value = '';
  document.getElementById('contact-search-results').innerHTML = '';
  lucide.createIcons();
  setTimeout(() => document.getElementById('add-contact-query')?.focus(), 100);
}

async function searchContact() {
  const query = document.getElementById('add-contact-query').value.trim();
  const results = document.getElementById('contact-search-results');
  if (!query) return;
  results.innerHTML = '<div class="spinner" style="margin:16px auto"></div>';
  try {
    const [byEmail, byUsername] = await Promise.all([
      db.collection('users').where('email', '==', query).limit(3).get(),
      db.collection('users').where('username', '==', query.replace('@', '')).limit(3).get()
    ]);
    const seen = new Set([currentUser.uid]);
    const users = [];
    [...byEmail.docs, ...byUsername.docs].forEach(d => {
      if (!seen.has(d.id)) { seen.add(d.id); users.push({ id: d.id, ...d.data() }); }
    });
    if (!users.length) {
      results.innerHTML = '<div class="text-secondary text-sm text-center" style="padding:16px">No user found</div>';
      return;
    }
    results.innerHTML = users.map(u => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px;border-radius:var(--radius-md);border:1px solid var(--border);margin-top:8px">
      <div class="avatar avatar-md" style="background:${stringToColor(u.displayName)}22;color:${stringToColor(u.displayName)}">${getInitials(u.displayName)}</div>
      <div style="flex:1">
        <div style="font-weight:600;font-size:14px">${u.displayName}</div>
        <div style="font-size:12px;color:var(--text-muted)">@${u.username || u.email}</div>
      </div>
      <button class="btn btn-primary" style="font-size:12px;padding:6px 14px" onclick="addContact('${u.id}','${u.displayName}')">
        <i data-lucide="user-plus" style="width:13px;height:13px"></i>Add
      </button>
    </div>`).join('');
    lucide.createIcons({ nodes: [results] });
  } catch (e) { results.innerHTML = '<div class="text-secondary text-sm text-center" style="padding:16px">Search error</div>'; }
}

async function addContact(uid, name) {
  try {
    await db.collection('users').doc(currentUser.uid).collection('contacts').doc(uid).set({
      addedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    // Also add reverse for the other user
    await db.collection('users').doc(uid).collection('contacts').doc(currentUser.uid).set({
      addedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    closeModal('modal-add-contact');
    showToast(`${name} added to contacts`, 'success');
    loadContacts();
  } catch (e) { showToast('Failed to add contact', 'error'); }
}
