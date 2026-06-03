/* ===== Profile Page (no Firebase Storage — free tier) ===== */
let profileStatus = 'online';

function loadProfilePage() {
  if (!currentUserData) return;
  const d = currentUserData;

  const nameEl   = document.getElementById('profile-display-name');
  const handleEl = document.getElementById('profile-handle');
  const emailEl  = document.getElementById('profile-email-display');
  if (nameEl)   nameEl.textContent   = d.displayName || '—';
  if (handleEl) handleEl.textContent = d.username ? `@${d.username}` : '—';
  if (emailEl)  emailEl.textContent  = d.email || '—';

  const nameInput     = document.getElementById('edit-displayname');
  const usernameInput = document.getElementById('edit-username');
  const bioInput      = document.getElementById('edit-bio');
  if (nameInput)     nameInput.value     = d.displayName || '';
  if (usernameInput) usernameInput.value = d.username    || '';
  if (bioInput)      bioInput.value      = d.bio         || '';

  const avatarEl = document.getElementById('profile-avatar-display');
  if (avatarEl) renderAvatar(avatarEl, d);

  profileStatus = d.status || 'online';
  selectProfileStatus(profileStatus);
}

function selectProfileStatus(status) {
  profileStatus = status;
  document.querySelectorAll('[id^="pstatus-"]').forEach(b => b.classList.remove('active'));
  document.getElementById(`pstatus-${status}`)?.classList.add('active');
}

async function saveProfile() {
  if (!currentUser) return;
  const displayName = document.getElementById('edit-displayname').value.trim();
  const username    = document.getElementById('edit-username').value.trim().toLowerCase();
  const bio         = document.getElementById('edit-bio').value.trim();

  if (!displayName) return showToast('Display name cannot be empty', 'error');
  if (username && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return showToast('Username: 3-20 chars, letters/numbers/underscores only', 'error');
  }

  try {
    if (username && username !== currentUserData?.username) {
      const snap = await db.collection('users').where('username', '==', username).get();
      if (!snap.empty && snap.docs[0].id !== currentUser.uid) {
        return showToast('Username is already taken', 'error');
      }
    }

    await currentUser.updateProfile({ displayName });
    await db.collection('users').doc(currentUser.uid).update({
      displayName, username, bio,
      status:    profileStatus,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await rtdb.ref(`presence/${currentUser.uid}`).update({ status: profileStatus });

    currentUserData = { ...currentUserData, displayName, username, bio, status: profileStatus };
    loadProfilePage();
    updateSidebarAvatar();
    showToast('Profile saved', 'success');
  } catch (e) {
    showToast('Failed to save: ' + e.message, 'error');
  }
}

// Compress image → base64 → store in Firestore (no Storage needed)
async function updateProfilePhoto(e) {
  const file = e.target.files[0];
  if (!file || !currentUser) return;
  if (file.size > 5 * 1024 * 1024) return showToast('Image must be under 5MB', 'error');

  showToast('Processing photo…', 'info');

  const reader = new FileReader();
  reader.onload = async (ev) => {
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      const MAX = 256;
      const ratio = Math.min(MAX / img.width, MAX / img.height);
      canvas.width  = img.width  * ratio;
      canvas.height = img.height * ratio;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 0.82);

      try {
        await db.collection('users').doc(currentUser.uid).update({ photoURL: base64 });
        currentUserData = { ...currentUserData, photoURL: base64 };
        loadProfilePage();
        updateSidebarAvatar();
        showToast('Photo updated', 'success');
      } catch (err) {
        showToast('Failed to save photo: ' + err.message, 'error');
      }
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}
