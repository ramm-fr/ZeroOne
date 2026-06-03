/* ===== Notifications ===== */
let notifications = [];

function listenToNotifications() {
  if (!currentUser) return;
  const unsub = db.collection('notifications')
    .where('recipientId', '==', currentUser.uid)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .onSnapshot(snap => {
      notifications = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderNotifications();
      updateNotifBadge();
    }, e => console.error('notifications:', e));
  unsubscribers.push(unsub);
  // Request browser notification permission
  if (Notification?.permission === 'default') Notification.requestPermission();
}

function renderNotifications() {
  const list = document.getElementById('notifications-list');
  if (!list) return;
  if (!notifications.length) {
    list.innerHTML = `<div class="empty-state" style="padding:48px">
      <div class="empty-icon"><i data-lucide="bell" style="width:32px;height:32px"></i></div>
      <div class="empty-title">No notifications</div>
      <div class="empty-desc">You're all caught up</div>
    </div>`;
    lucide.createIcons({ nodes: [list] });
    return;
  }
  list.innerHTML = notifications.map(n => {
    const icons = { message: 'message-square', call: 'phone', missed_call: 'phone-missed', contact_request: 'user-plus', system: 'info' };
    return `
    <div class="notif-item ${n.read ? '' : 'unread'}" onclick="handleNotifClick('${n.id}','${n.type}','${n.referenceId||''}')">
      <div class="avatar avatar-sm" style="background:${stringToColor(n.senderName||'')}22;color:${stringToColor(n.senderName||'')}">${getInitials(n.senderName||'?')}</div>
      <div class="notif-content">
        <div class="notif-text"><strong>${n.senderName || 'ZeroOne'}</strong> ${n.body || ''}</div>
        <div class="notif-time">${formatTime(n.createdAt)}</div>
      </div>
      ${!n.read ? '<div class="notif-unread-dot"></div>' : ''}
    </div>`;
  }).join('');
}

function updateNotifBadge() {
  const unread = notifications.filter(n => !n.read).length;
  const badge = document.getElementById('badge-notifs');
  if (badge) badge.classList.toggle('hidden', unread === 0);
}

async function markAllRead() {
  const batch = db.batch();
  notifications.filter(n => !n.read).forEach(n => {
    batch.update(db.collection('notifications').doc(n.id), { read: true });
  });
  try {
    await batch.commit();
    showToast('All notifications marked as read', 'success');
  } catch (e) {}
}

async function handleNotifClick(id, type, referenceId) {
  // Mark as read
  await db.collection('notifications').doc(id).update({ read: true });
  // Navigate to relevant section
  if (type === 'message' && referenceId) { openChat(referenceId); navigate('messages'); }
  else if (type === 'call' && referenceId) navigate('calls');
  else if (type === 'contact_request') navigate('contacts');
}

// Create notification helper (used by other modules)
async function createNotification(recipientId, type, body, referenceId = '') {
  if (!currentUser || recipientId === currentUser.uid) return;
  try {
    await db.collection('notifications').add({
      recipientId,
      senderId: currentUser.uid,
      senderName: currentUserData?.displayName || 'Someone',
      type,
      body,
      referenceId,
      read: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {}
}
