/* ===== Utility Functions ===== */

// Toast Notifications
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success: 'check-circle', error: 'x-circle', info: 'info' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i data-lucide="${icons[type] || 'info'}" class="toast-icon" style="width:18px;height:18px"></i>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  lucide.createIcons({ nodes: [toast] });
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Format timestamp
function formatTime(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = now - date;
  const secs = Math.floor(diff / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (secs < 60) return 'now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatFullTime(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

// Generate initials from name
function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// Generate random color from string
function stringToColor(str) {
  const colors = ['#6c63ff', '#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Render avatar element (initials or image)
function renderAvatar(container, user, sizeClass = 'avatar-md') {
  if (!container) return;
  if (user?.photoURL) {
    container.innerHTML = `<img src="${user.photoURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />`;
    container.style.background = 'transparent';
  } else {
    const initials = getInitials(user?.displayName || user?.name || '?');
    container.textContent = initials;
    container.style.background = stringToColor(user?.uid || user?.displayName || 'default') + '22';
    container.style.color = stringToColor(user?.uid || user?.displayName || 'default');
  }
}

// Generate unique ID
function genId(prefix = '') {
  return prefix + Math.random().toString(36).substr(2, 9).toUpperCase();
}

// Debounce
function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Close modal
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

// Toggle password visibility
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.innerHTML = '<i data-lucide="eye-off" style="width:16px;height:16px"></i>';
  } else {
    input.type = 'password';
    btn.innerHTML = '<i data-lucide="eye" style="width:16px;height:16px"></i>';
  }
  lucide.createIcons({ nodes: [btn] });
}

// Loading button state
function setLoading(btnId, loading, text = '') {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (loading) {
    btn._originalHTML = btn.innerHTML;
    btn.innerHTML = '<div class="spinner"></div>';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn._originalHTML || text;
    btn.disabled = false;
    lucide.createIcons({ nodes: [btn] });
  }
}

// Format file size
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Close dropdowns on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('#emoji-picker') && !e.target.closest('#emoji-btn')) {
    document.getElementById('emoji-picker')?.classList.add('hidden');
  }
  if (!e.target.closest('#msg-context-menu')) {
    document.getElementById('msg-context-menu')?.classList.add('hidden');
  }
});

// Pressing Escape closes modals
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
    document.getElementById('emoji-picker')?.classList.add('hidden');
    document.getElementById('msg-context-menu')?.classList.add('hidden');
  }
});

// ── Media helpers (Storage-free, free tier compatible) ──────────────────────

/**
 * Read a File as a base64 data URI.
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Convert a Blob (e.g. recorded audio) to a base64 data URI.
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read blob'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Compress an image File to a base64 JPEG at maxWidth px wide.
 * Quality: 0–1 (default 0.82).
 */
function compressImageToBase64(file, maxWidth = 600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode image'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ratio  = Math.min(1, maxWidth / img.width);
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}
