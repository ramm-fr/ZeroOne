/* ===== Dashboard Core ===== */

let currentUser = null;
let currentUserData = null;
let currentPage = 'home';
let unsubscribers = [];

async function initDashboard() {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = 'index.html';
      return;
    }
    currentUser = user;
    await loadUserData(user.uid);
    setupPresence(user.uid);
    loadAllData();
    updateGreeting();
  });
}

async function loadUserData(uid) {
  try {
    const snap = await db.collection('users').doc(uid).get();
    if (snap.exists) {
      currentUserData = snap.data();
      updateSidebarAvatar();
      loadProfilePage();
      // Load settings toggles
      const prefs = currentUserData.preferences || {};
      syncToggle('toggle-notif', prefs.notifications !== false);
      syncToggle('toggle-sounds', prefs.sounds !== false);
      syncToggle('toggle-receipts', !!prefs.readReceipts);
      syncToggle('toggle-hd', prefs.hd !== false);
    }
  } catch (e) { console.error('loadUserData:', e); }
}

function syncToggle(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (val) el.classList.add('on'); else el.classList.remove('on');
}

function updateSidebarAvatar() {
  const el = document.getElementById('sidebar-avatar-el');
  if (el) renderAvatar(el, currentUserData || currentUser);
}

function setupPresence(uid) {
  const presenceRef = rtdb.ref(`presence/${uid}`);
  presenceRef.set({ status: 'online', lastSeen: firebase.database.ServerValue.TIMESTAMP });
  presenceRef.onDisconnect().set({ status: 'offline', lastSeen: firebase.database.ServerValue.TIMESTAMP });
}

function loadAllData() {
  listenToChats();
  listenToCallHistory();
  listenToNotifications();
  loadContacts();
  loadGroups();
  loadUpcomingMeetings();
}

function navigate(page) {
  if (currentPage === page) return;
  // Hide all pages
  document.querySelectorAll('[id^="page-"]').forEach(p => p.classList.add('hidden'));
  // Remove active from nav
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
  // Show target page
  const target = document.getElementById(`page-${page}`);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('page-enter');
    setTimeout(() => target.classList.remove('page-enter'), 400);
  }
  // Activate nav item
  const navEl = document.getElementById(`nav-${page}`);
  if (navEl) navEl.classList.add('active');
  currentPage = page;
  lucide.createIcons();
}

function updateGreeting() {
  const el = document.getElementById('home-greeting');
  if (!el) return;
  const h = new Date().getHours();
  const name = (currentUserData?.displayName || currentUser?.displayName || 'there').split(' ')[0];
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  el.textContent = `${greet}, ${name} 👋`;
}

// Toggle settings
async function toggleSetting(key, el) {
  el.classList.toggle('on');
  const val = el.classList.contains('on');
  const prefs = currentUserData?.preferences || {};
  prefs[key] = val;
  try {
    await db.collection('users').doc(currentUser.uid).update({ [`preferences.${key}`]: val });
    if (currentUserData) currentUserData.preferences = prefs;
  } catch (e) { showToast('Failed to save setting', 'error'); }
}

// Sign out
async function handleSignOut() {
  try {
    await rtdb.ref(`presence/${currentUser.uid}`).set({ status: 'offline', lastSeen: firebase.database.ServerValue.TIMESTAMP });
    await auth.signOut();
    window.location.href = 'index.html';
  } catch (e) { showToast('Sign out failed', 'error'); }
}

// Confirm delete account
function confirmDeleteAccount() {
  if (!confirm('This will permanently delete your account and all your data. This action cannot be undone.\n\nAre you sure?')) return;
  deleteAccount();
}

async function deleteAccount() {
  try {
    await db.collection('users').doc(currentUser.uid).delete();
    await rtdb.ref(`presence/${currentUser.uid}`).remove();
    await currentUser.delete();
    window.location.href = 'index.html';
  } catch (e) {
    if (e.code === 'auth/requires-recent-login') {
      showToast('Please sign in again to delete your account', 'error');
      auth.signOut().then(() => window.location.href = 'index.html');
    } else {
      showToast('Failed to delete account', 'error');
    }
  }
}

// Change Password
function openChangePasswordModal() {
  document.getElementById('modal-change-password').classList.remove('hidden');
  lucide.createIcons();
}

async function changePassword() {
  const oldPwd = document.getElementById('old-password').value;
  const newPwd = document.getElementById('new-password').value;
  const confPwd = document.getElementById('confirm-new-password').value;
  if (!oldPwd || !newPwd || !confPwd) return showToast('Fill in all fields', 'error');
  if (newPwd !== confPwd) return showToast('Passwords do not match', 'error');
  if (newPwd.length < 8) return showToast('Password must be at least 8 characters', 'error');
  try {
    const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, oldPwd);
    await currentUser.reauthenticateWithCredential(cred);
    await currentUser.updatePassword(newPwd);
    closeModal('modal-change-password');
    showToast('Password updated successfully', 'success');
  } catch (e) {
    if (e.code === 'auth/wrong-password') showToast('Current password is incorrect', 'error');
    else showToast('Failed to update password', 'error');
  }
}

// Dialpad
function openDialer() {
  showToast('Dialpad coming soon', 'info');
}
