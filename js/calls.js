/* ===== Calls / WebRTC ===== */
let localStream = null;
let peerConnections = {};
let callData = null;
let callTimer = null;
let callSeconds = 0;
let screenStream = null;
let isMicMuted = false;
let isVideoOff = false;
let isHandRaised = false;
let isScreenSharing = false;

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

function listenToCallHistory() {
  if (!currentUser) return;
  const unsub = db.collection('callHistory')
    .where('participants', 'array-contains', currentUser.uid)
    .orderBy('startedAt', 'desc')
    .limit(50)
    .onSnapshot(snap => {
      renderCallHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, e => console.error('callHistory:', e));
  unsubscribers.push(unsub);
  // Listen for incoming calls
  listenForIncomingCalls();
}

function listenForIncomingCalls() {
  rtdb.ref(`calls/${currentUser.uid}/incoming`).on('value', async snap => {
    const data = snap.val();
    if (!data || data.status !== 'ringing') return;
    showIncomingCall(data);
  });
}

function renderCallHistory(calls) {
  const list = document.getElementById('call-history-list');
  if (!list) return;
  if (!calls.length) {
    list.innerHTML = '<div class="empty-state" style="padding:32px 16px"><div class="empty-icon"><i data-lucide="phone-missed" style="width:24px;height:24px"></i></div><div class="empty-title">No call history</div></div>';
    lucide.createIcons({ nodes: [list] });
    return;
  }
  list.innerHTML = calls.map(call => {
    const isOutgoing = call.callerId === currentUser.uid;
    const other = call.participantData?.find(p => p.uid !== currentUser.uid);
    const name = other?.displayName || 'Unknown';
    const icon = call.missed ? 'phone-missed' : isOutgoing ? 'phone-outgoing' : 'phone-incoming';
    const iconColor = call.missed ? 'var(--red)' : 'var(--green)';
    return `
    <div class="chat-item" onclick="callUser('${other?.uid}','${name}','${call.type || 'video'}')">
      <div class="avatar avatar-md" style="background:${stringToColor(name)}22;color:${stringToColor(name)}">${getInitials(name)}</div>
      <div class="chat-item-info">
        <div class="chat-item-name">${name}</div>
        <div class="chat-item-preview" style="display:flex;align-items:center;gap:4px">
          <i data-lucide="${icon}" style="width:12px;height:12px;color:${iconColor}"></i>
          ${call.type === 'video' ? 'Video' : 'Audio'} · ${call.duration || '—'}
        </div>
      </div>
      <div class="chat-item-meta">
        <span class="chat-item-time">${formatTime(call.startedAt)}</span>
        <button class="btn-icon-sm btn-ghost" onclick="event.stopPropagation();callUser('${other?.uid}','${name}','video')" style="background:var(--accent-dim);color:var(--accent)">
          <i data-lucide="video" style="width:14px;height:14px"></i>
        </button>
      </div>
    </div>`;
  }).join('');
  lucide.createIcons({ nodes: [list] });
}

function filterCalls(q) {
  document.querySelectorAll('#call-history-list .chat-item').forEach(el => {
    const name = el.querySelector('.chat-item-name')?.textContent.toLowerCase() || '';
    el.style.display = name.includes(q.toLowerCase()) ? '' : 'none';
  });
}

async function startVideoCall() {
  if (activeChat && activeChatData) {
    const other = (activeChatData.memberData || []).find(m => m.uid !== currentUser.uid);
    if (other) { callUser(other.uid, other.displayName, 'video'); return; }
  }
  showToast('Select a contact first', 'info');
}

async function startAudioCall() {
  if (activeChat && activeChatData) {
    const other = (activeChatData.memberData || []).find(m => m.uid !== currentUser.uid);
    if (other) { callUser(other.uid, other.displayName, 'audio'); return; }
  }
  showToast('Select a contact first', 'info');
}

async function callUser(uid, name, type = 'video') {
  if (!uid) return;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: type === 'video', audio: true });
    const roomId = genId('call_');
    callData = { roomId, type, calleeId: uid, calleeName: name };
    // Signal callee
    await rtdb.ref(`calls/${uid}/incoming`).set({
      roomId, type, callerId: currentUser.uid,
      callerName: currentUserData?.displayName || 'Unknown',
      callerPhoto: currentUserData?.photoURL || '',
      status: 'ringing',
      startedAt: firebase.database.ServerValue.TIMESTAMP
    });
    openCallOverlay(name, type, roomId, true);
  } catch (e) {
    if (e.name === 'NotAllowedError') showToast('Camera/microphone permission denied', 'error');
    else showToast('Could not start call: ' + e.message, 'error');
  }
}

function showIncomingCall(data) {
  const overlay = document.getElementById('incoming-call-overlay');
  if (!overlay) return;
  document.getElementById('inc-caller-name').textContent = data.callerName || 'Unknown';
  document.getElementById('inc-call-type').textContent = data.type === 'video' ? '📹 Video Call' : '📞 Audio Call';
  const av = document.getElementById('inc-caller-avatar');
  if (av) {
    av.textContent = getInitials(data.callerName || '?');
    av.style.background = stringToColor(data.callerName || '') + '22';
    av.style.color = stringToColor(data.callerName || '');
  }
  window._incomingCallData = data;
  overlay.classList.remove('hidden');
  // Play ringtone
  playCallSound('ring');
}

async function answerCall() {
  const data = window._incomingCallData;
  if (!data) return;
  document.getElementById('incoming-call-overlay')?.classList.add('hidden');
  stopCallSound();
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: data.type === 'video', audio: true });
    openCallOverlay(data.callerName, data.type, data.roomId, false);
    await rtdb.ref(`calls/${currentUser.uid}/incoming`).update({ status: 'answered' });
  } catch (e) {
    showToast('Could not answer: ' + e.message, 'error');
  }
}

async function answerAudio() {
  const data = window._incomingCallData;
  if (!data) return;
  data.type = 'audio';
  answerCall();
}

async function declineCall() {
  const data = window._incomingCallData;
  document.getElementById('incoming-call-overlay')?.classList.add('hidden');
  stopCallSound();
  if (data) {
    await rtdb.ref(`calls/${currentUser.uid}/incoming`).update({ status: 'declined' });
    await rtdb.ref(`calls/${data.callerId}/callStatus`).set('declined');
  }
}

function openCallOverlay(name, type, roomId, isCaller) {
  const overlay = document.getElementById('call-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  document.getElementById('call-name-pill').textContent = name;
  document.getElementById('call-grid').innerHTML = '';
  // Add local video
  addParticipantTile('You', localStream, true);
  if (type === 'audio') {
    document.getElementById('btn-toggle-video').classList.add('off');
  }
  startCallTimer();
  setupWebRTC(roomId, isCaller);
  lucide.createIcons({ nodes: [overlay] });
}

function addParticipantTile(name, stream, isLocal) {
  const grid = document.getElementById('call-grid');
  if (!grid) return;
  const id = 'tile-' + (isLocal ? 'local' : genId());
  const tile = document.createElement('div');
  tile.className = 'call-participant';
  tile.id = id;
  tile.innerHTML = `
    <div class="participant-avatar-large">${getInitials(name)}</div>
    <video class="participant-video hidden" autoplay ${isLocal ? 'muted' : ''} playsinline></video>
    <div class="participant-overlay">
      <div class="participant-name">
        <i data-lucide="${isLocal ? 'user' : 'user-check'}" style="width:14px;height:14px"></i>
        ${name} ${isLocal ? '(You)' : ''}
      </div>
    </div>`;
  grid.appendChild(tile);
  lucide.createIcons({ nodes: [tile] });
  if (stream) attachStream(id, stream);
  return id;
}

function attachStream(tileId, stream) {
  const tile = document.getElementById(tileId);
  const video = tile?.querySelector('video');
  if (!video) return;
  video.srcObject = stream;
  if (stream.getVideoTracks().length > 0) video.classList.remove('hidden');
}

async function setupWebRTC(roomId, isCaller) {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  peerConnections[roomId] = pc;
  localStream?.getTracks().forEach(track => pc.addTrack(track, localStream));
  pc.ontrack = (e) => {
    const [remoteStream] = e.streams;
    const remoteId = addParticipantTile(callData?.calleeName || 'Remote', remoteStream, false);
    setTimeout(() => attachStream(remoteId, remoteStream), 100);
  };
  pc.onicecandidate = async (e) => {
    if (e.candidate) {
      await rtdb.ref(`webrtc/${roomId}/${isCaller ? 'callerCandidates' : 'calleeCandidates'}`).push(e.candidate.toJSON());
    }
  };
  if (isCaller) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await rtdb.ref(`webrtc/${roomId}/offer`).set({ type: offer.type, sdp: offer.sdp });
    // Watch for answer
    rtdb.ref(`webrtc/${roomId}/answer`).on('value', async snap => {
      const ans = snap.val();
      if (ans && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(ans));
      }
    });
    rtdb.ref(`webrtc/${roomId}/calleeCandidates`).on('child_added', async snap => {
      if (snap.val()) await pc.addIceCandidate(new RTCIceCandidate(snap.val()));
    });
  } else {
    const offerSnap = await rtdb.ref(`webrtc/${roomId}/offer`).once('value');
    const offer = offerSnap.val();
    if (offer) {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await rtdb.ref(`webrtc/${roomId}/answer`).set({ type: answer.type, sdp: answer.sdp });
    }
    rtdb.ref(`webrtc/${roomId}/callerCandidates`).on('child_added', async snap => {
      if (snap.val()) await pc.addIceCandidate(new RTCIceCandidate(snap.val()));
    });
  }
}

function toggleMic() {
  if (!localStream) return;
  isMicMuted = !isMicMuted;
  localStream.getAudioTracks().forEach(t => t.enabled = !isMicMuted);
  const btn = document.getElementById('btn-toggle-mic');
  if (btn) btn.classList.toggle('muted', isMicMuted);
  const icon = isMicMuted ? 'mic-off' : 'mic';
  btn.innerHTML = `<i data-lucide="${icon}" style="width:22px;height:22px"></i>`;
  lucide.createIcons({ nodes: [btn] });
}

function toggleVideo() {
  if (!localStream) return;
  isVideoOff = !isVideoOff;
  localStream.getVideoTracks().forEach(t => t.enabled = !isVideoOff);
  const btn = document.getElementById('btn-toggle-video');
  if (btn) btn.classList.toggle('off', isVideoOff);
  const icon = isVideoOff ? 'video-off' : 'video';
  btn.innerHTML = `<i data-lucide="${icon}" style="width:22px;height:22px"></i>`;
  lucide.createIcons({ nodes: [btn] });
  const localVideo = document.querySelector('#tile-local video');
  if (localVideo) localVideo.classList.toggle('hidden', isVideoOff);
}

async function toggleScreenShare() {
  if (isScreenSharing) {
    stopScreenShare();
    return;
  }
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const screenTrack = screenStream.getVideoTracks()[0];
    Object.values(peerConnections).forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) sender.replaceTrack(screenTrack);
    });
    screenTrack.onended = () => stopScreenShare();
    isScreenSharing = true;
    const btn = document.getElementById('btn-screen-share');
    if (btn) btn.classList.add('active-green');
    showToast('Screen sharing started', 'success');
  } catch (e) {
    if (e.name !== 'NotAllowedError') showToast('Could not share screen', 'error');
  }
}

function stopScreenShare() {
  if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
  Object.values(peerConnections).forEach(pc => {
    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
    const vidTrack = localStream?.getVideoTracks()[0];
    if (sender && vidTrack) sender.replaceTrack(vidTrack);
  });
  isScreenSharing = false;
  const btn = document.getElementById('btn-screen-share');
  if (btn) btn.classList.remove('active-green');
  showToast('Screen sharing stopped', 'info');
}

function toggleRaiseHand() {
  isHandRaised = !isHandRaised;
  const btn = document.getElementById('btn-raise-hand');
  if (btn) btn.classList.toggle('active-green', isHandRaised);
  showToast(isHandRaised ? '✋ Hand raised' : 'Hand lowered', 'info');
}

function startCallTimer() {
  callSeconds = 0;
  callTimer = setInterval(() => {
    callSeconds++;
    const m = Math.floor(callSeconds / 60).toString().padStart(2, '0');
    const s = (callSeconds % 60).toString().padStart(2, '0');
    const el = document.getElementById('call-duration-display');
    if (el) el.textContent = `${m}:${s}`;
  }, 1000);
}

async function endCall() {
  clearInterval(callTimer);
  // Stop streams
  localStream?.getTracks().forEach(t => t.stop());
  screenStream?.getTracks().forEach(t => t.stop());
  // Close peer connections
  Object.values(peerConnections).forEach(pc => pc.close());
  peerConnections = {};
  localStream = null;
  screenStream = null;
  isMicMuted = false;
  isVideoOff = false;
  isHandRaised = false;
  isScreenSharing = false;
  // Hide overlay
  document.getElementById('call-overlay')?.classList.add('hidden');
  // Save to call history
  if (callData && currentUser) {
    try {
      const duration = formatCallDuration(callSeconds);
      await db.collection('callHistory').add({
        roomId: callData.roomId,
        type: callData.type || 'video',
        callerId: currentUser.uid,
        participants: [currentUser.uid, callData.calleeId].filter(Boolean),
        participantData: [
          { uid: currentUser.uid, displayName: currentUserData?.displayName || 'You' },
          { uid: callData.calleeId, displayName: callData.calleeName }
        ],
        duration,
        missed: callSeconds < 5,
        startedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {}
  }
  // Clean up signaling
  if (callData?.roomId) {
    rtdb.ref(`webrtc/${callData.roomId}`).remove();
    if (callData.calleeId) rtdb.ref(`calls/${callData.calleeId}/incoming`).remove();
  }
  callData = null;
  showToast('Call ended · ' + formatCallDuration(callSeconds), 'info');
}

function formatCallDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function openCallChat() { showToast('In-call chat coming soon', 'info'); }
function openParticipantsList() { showToast('Participants list coming soon', 'info'); }
function openCallSettings() { showToast('Call settings coming soon', 'info'); }
function openShareScreen() { toggleScreenShare(); }

let callAudio = null;
function playCallSound(type) {
  // Simple oscillator-based ring
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    osc.start();
    window._ringOsc = osc;
    window._ringCtx = ctx;
  } catch (e) {}
}

function stopCallSound() {
  try {
    window._ringOsc?.stop();
    window._ringCtx?.close();
  } catch (e) {}
}
