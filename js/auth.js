/* ===== Authentication ===== */

// Switch between Login and Register tabs
function switchAuthTab(tab) {
  document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
  document.getElementById('form-register').classList.toggle('hidden', tab !== 'register');
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
}

// Handle Login
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) return showToast('Please fill in all fields', 'error');
  setLoading('btn-login', true);
  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    await updateOnlineStatus(cred.user.uid, 'online');
    const profileSnap = await db.collection('users').doc(cred.user.uid).get();
    if (!profileSnap.exists || !profileSnap.data().setupDone) {
      showProfileSetup(cred.user);
    } else {
      window.location.href = 'dashboard.html';
    }
  } catch (err) {
    showToast(getAuthError(err.code), 'error');
  } finally {
    setLoading('btn-login', false);
  }
}

// Handle Register
async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirm = document.getElementById('reg-confirm').value;
  if (!name || !email || !password) return showToast('Please fill in all fields', 'error');
  if (password !== confirm) return showToast('Passwords do not match', 'error');
  if (password.length < 8) return showToast('Password must be at least 8 characters', 'error');
  setLoading('btn-register', true);
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });
    await db.collection('users').doc(cred.user.uid).set({
      uid: cred.user.uid,
      displayName: name,
      email: email,
      username: '',
      bio: '',
      photoURL: '',
      status: 'online',
      setupDone: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      preferences: { notifications: true, sounds: true, readReceipts: false, hd: true }
    });
    showProfileSetup(cred.user);
  } catch (err) {
    showToast(getAuthError(err.code), 'error');
  } finally {
    setLoading('btn-register', false);
  }
}

// Google login
async function handleGoogleLogin() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    const cred = await auth.signInWithPopup(provider);
    await updateOnlineStatus(cred.user.uid, 'online');
    const snap = await db.collection('users').doc(cred.user.uid).get();
    if (!snap.exists) {
      await db.collection('users').doc(cred.user.uid).set({
        uid: cred.user.uid,
        displayName: cred.user.displayName || '',
        email: cred.user.email,
        username: '',
        bio: '',
        photoURL: cred.user.photoURL || '',
        status: 'online',
        setupDone: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        preferences: { notifications: true, sounds: true, readReceipts: false, hd: true }
      });
      showProfileSetup(cred.user);
    } else if (!snap.data().setupDone) {
      showProfileSetup(cred.user);
    } else {
      window.location.href = 'dashboard.html';
    }
  } catch (err) {
    console.error('Google login error:', err.code, err.message);
    if (err.code === 'auth/operation-not-allowed' || err.code === 'auth/configuration-not-found' || err.code === 'auth/internal-error') {
      document.getElementById('modal-setup-guide')?.classList.remove('hidden');
      lucide.createIcons();
    } else {
      showToast(getAuthError(err.code), 'error');
    }
  }
}

// GitHub login
async function handleGithubLogin() {
  try {
    const provider = new firebase.auth.GithubAuthProvider();
    provider.addScope('user:email');
    const cred = await auth.signInWithPopup(provider);
    await updateOnlineStatus(cred.user.uid, 'online');
    const snap = await db.collection('users').doc(cred.user.uid).get();
    if (!snap.exists) {
      await db.collection('users').doc(cred.user.uid).set({
        uid: cred.user.uid,
        displayName: cred.user.displayName || '',
        email: cred.user.email,
        username: '',
        bio: '',
        photoURL: cred.user.photoURL || '',
        status: 'online',
        setupDone: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        preferences: { notifications: true, sounds: true, readReceipts: false, hd: true }
      });
      showProfileSetup(cred.user);
    } else if (!snap.data().setupDone) {
      showProfileSetup(cred.user);
    } else {
      window.location.href = 'dashboard.html';
    }
  } catch (err) {
    console.error('GitHub login error:', err.code, err.message);
    if (err.code === 'auth/operation-not-allowed' || err.code === 'auth/configuration-not-found' || err.code === 'auth/internal-error') {
      document.getElementById('modal-setup-guide')?.classList.remove('hidden');
      lucide.createIcons();
    } else {
      showToast(getAuthError(err.code), 'error');
    }
  }
}

// Forgot Password
function showForgotPassword() {
  document.getElementById('modal-forgot').classList.remove('hidden');
}

async function handleForgotPassword() {
  const email = document.getElementById('forgot-email').value.trim();
  if (!email) return showToast('Please enter your email', 'error');
  try {
    await auth.sendPasswordResetEmail(email);
    showToast('Reset link sent! Check your inbox.', 'success');
    document.getElementById('modal-forgot').classList.add('hidden');
  } catch (err) {
    showToast(getAuthError(err.code), 'error');
  }
}

// Show profile setup
function showProfileSetup(user) {
  document.getElementById('page-login').classList.add('hidden');
  const setup = document.getElementById('page-profile-setup');
  setup.classList.remove('hidden');
  const initials = getInitials(user.displayName || user.email || '?');
  document.getElementById('avatar-initials').textContent = initials;
  document.getElementById('setup-displayname').value = user.displayName || '';
  document.getElementById('setup-username').value = (user.displayName || '').toLowerCase().replace(/\s+/g, '_');
  lucide.createIcons();
}

// Update online status in Realtime DB
async function updateOnlineStatus(uid, status) {
  try {
    await rtdb.ref(`presence/${uid}`).set({
      status,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
    rtdb.ref(`presence/${uid}`).onDisconnect().set({
      status: 'offline',
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
  } catch (e) { /* silently fail */ }
}

// Translate Firebase error codes
function getAuthError(code) {
  const map = {
    'auth/invalid-email': 'Invalid email address.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/email-already-in-use': 'Email already in use.',
    'auth/weak-password': 'Password is too weak (min. 6 chars).',
    'auth/too-many-requests': 'Too many attempts. Try again later.',
    'auth/popup-closed-by-user': 'Sign-in popup was closed.',
    'auth/cancelled-popup-request': 'Sign-in cancelled.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled. Enable it in Firebase Console → Authentication → Sign-in methods.',
    'auth/configuration-not-found': 'Firebase Auth not configured. Enable sign-in providers in Firebase Console → Authentication.',
    'auth/unauthorized-domain': 'This domain is not authorized. Add it in Firebase Console → Authentication → Settings → Authorized domains.',
    'auth/internal-error': 'Auth service error. Check that your Firebase project has Authentication enabled.',
    'auth/popup-blocked': 'Popup was blocked by your browser. Allow popups for this site.',
    'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method.',
  };
  return map[code] || `Auth error: ${code}. Check the browser console for details.`;
}

// Guard: redirect if already logged in
auth.onAuthStateChanged(async (user) => {
  if (user && window.location.pathname.includes('index.html') || 
      user && window.location.pathname === '/' ||
      user && window.location.pathname.endsWith('/call/')) {
    const snap = await db.collection('users').doc(user.uid).get();
    if (snap.exists && snap.data().setupDone) {
      window.location.href = 'dashboard.html';
    }
  }
});

// ── Firebase setup health-check ──────────────────────────────────────────────
// Runs silently; shows a banner only when something is misconfigured so
// developers know exactly what to fix without digging through console noise.
(async function checkFirebaseSetup() {
  try {
    // Test Firestore connectivity (lightweight read to a non-existent doc)
    await db.collection('_healthcheck').doc('ping').get();
  } catch (e) {
    if (e.code === 'permission-denied') {
      // Firestore is reachable but rules blocked us — that's fine, it's working
    } else {
      showSetupBanner('firestore', e.message);
    }
  }
})();

function showSetupBanner(service, detail) {
  // Only show once per page load
  if (document.getElementById('setup-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'setup-banner';
  banner.style.cssText = `
    position:fixed;bottom:0;left:0;right:0;z-index:9999;
    background:#1a0a0a;border-top:1px solid rgba(239,68,68,0.4);
    padding:10px 20px;display:flex;align-items:center;gap:12px;
    font-family:-apple-system,sans-serif;font-size:13px;color:#fca5a5;
  `;
  banner.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <span>Firebase <strong>${service}</strong> not reachable: ${detail.split('\n')[0]}</span>
    <a href="https://console.firebase.google.com" target="_blank" style="margin-left:auto;color:#f87171;text-decoration:underline;white-space:nowrap">Open Firebase Console →</a>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#f87171;cursor:pointer;font-size:18px;line-height:1;padding:0 4px">✕</button>
  `;
  document.body.appendChild(banner);
}
