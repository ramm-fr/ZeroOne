/* ===== Profile Setup (no Firebase Storage — free tier) ===== */

let setupPrefs = { notifications: true, sounds: true, readReceipts: false, hd: true };
let setupStatus = 'online';
let setupAvatarBase64 = null;   // stores compressed base64 image string

function nextSetupStep(step) {
  if (step === 3) {
    const displayName = document.getElementById('setup-displayname').value.trim();
    const username = document.getElementById('setup-username').value.trim();
    if (!displayName) return showToast('Please enter your display name', 'error');
    if (!username) return showToast('Please enter a username', 'error');
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return showToast('Username: 3-20 chars, letters/numbers/underscores only', 'error');
    }
  }
  document.querySelectorAll('.setup-step').forEach((el, i) => {
    const n = i + 1;
    el.classList.remove('active', 'done');
    if (n < step) el.classList.add('done');
    if (n === step) el.classList.add('active');
  });
  document.querySelectorAll('.setup-step.done .step-dot').forEach(dot => {
    dot.innerHTML = '<i data-lucide="check" style="width:15px;height:15px"></i>';
  });
  for (let i = 1; i <= 3; i++) {
    document.getElementById(`setup-step-${i}`)?.classList.toggle('hidden', i !== step);
  }
  lucide.createIcons();
}

function previewAvatar(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) return showToast('Image must be under 5MB', 'error');

  const reader = new FileReader();
  reader.onload = (ev) => {
    // Compress via canvas before storing as base64
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX = 256;
      const ratio = Math.min(MAX / img.width, MAX / img.height);
      canvas.width  = img.width  * ratio;
      canvas.height = img.height * ratio;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      setupAvatarBase64 = canvas.toDataURL('image/jpeg', 0.82);

      // Show preview
      const previewImg = document.getElementById('avatar-img');
      const initials   = document.getElementById('avatar-initials');
      if (previewImg) { previewImg.src = setupAvatarBase64; previewImg.classList.remove('hidden'); }
      if (initials)   { initials.classList.add('hidden'); }
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function generateAvatar() {
  setupAvatarBase64 = null;   // will fall back to initials rendering
  const name     = document.getElementById('setup-displayname').value || 'User';
  const initials = getInitials(name);
  const el  = document.getElementById('avatar-initials');
  const img = document.getElementById('avatar-img');
  if (el)  { el.textContent = initials; el.classList.remove('hidden'); }
  if (img) { img.src = ''; img.classList.add('hidden'); }
  showToast('Using initials avatar', 'info');
}

function selectStatus(btn, status) {
  setupStatus = status;
  document.querySelectorAll('.status-opt').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function togglePref(card, key) {
  card.classList.toggle('active');
  setupPrefs[key] = card.classList.contains('active');
}

async function finishSetup() {
  const user = auth.currentUser;
  if (!user) return showToast('Session expired. Please log in again.', 'error');

  const displayName = document.getElementById('setup-displayname').value.trim();
  const username    = document.getElementById('setup-username').value.trim().toLowerCase();
  const bio         = document.getElementById('setup-bio').value.trim();

  setLoading('btn-finish-setup', true);
  try {
    // Check username uniqueness
    const usernameSnap = await db.collection('users').where('username', '==', username).get();
    if (!usernameSnap.empty && usernameSnap.docs[0].id !== user.uid) {
      return showToast('Username is already taken', 'error');
    }

    // Update Firebase Auth display name
    await user.updateProfile({ displayName });

    // Build Firestore payload — store base64 photo directly (no Storage needed)
    const userData = {
      uid:         user.uid,
      displayName,
      username,
      bio,
      photoURL:    setupAvatarBase64 || '',   // base64 string or ''
      email:       user.email,
      status:      setupStatus,
      setupDone:   true,
      updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
      preferences: setupPrefs
    };

    await db.collection('users').doc(user.uid).set(userData, { merge: true });

    // Set online presence
    await rtdb.ref(`presence/${user.uid}`).set({
      status:   setupStatus,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });

    showToast('Profile saved! Welcome to ZeroOne 🎉', 'success');
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 800);
  } catch (err) {
    console.error('finishSetup error:', err);
    showToast('Failed to save profile: ' + err.message, 'error');
  } finally {
    setLoading('btn-finish-setup', false);
  }
}
