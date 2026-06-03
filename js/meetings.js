/* ===== Meetings ===== */

let currentMeetingId = null;
let meetingVideoOn = false;
let meetingMicOn = true;

function openNewMeetingModal() {
  currentMeetingId = genId('ZO-');
  document.getElementById('meeting-id-display').textContent = formatMeetingId(currentMeetingId);
  document.getElementById('meeting-topic').value = '';
  document.getElementById('modal-new-meeting').classList.remove('hidden');
  lucide.createIcons();
}

function openJoinModal() {
  document.getElementById('join-meeting-id').value = '';
  document.getElementById('join-display-name').value = currentUserData?.displayName || '';
  document.getElementById('modal-join').classList.remove('hidden');
  lucide.createIcons();
}

function openScheduleModal() {
  const now = new Date();
  document.getElementById('sched-date').value = now.toISOString().split('T')[0];
  document.getElementById('sched-time').value = `${String(now.getHours()).padStart(2,'0')}:00`;
  document.getElementById('modal-schedule').classList.remove('hidden');
  lucide.createIcons();
}

function formatMeetingId(id) {
  // Format as XXX-XXX-XXX
  const clean = id.replace('ZO-', '').toUpperCase();
  return clean.match(/.{1,3}/g)?.join('-').slice(0, 11) || id;
}

function toggleMeetingOpt(type) {
  if (type === 'video') {
    meetingVideoOn = !meetingVideoOn;
    document.getElementById('opt-video-on')?.classList.toggle('active', meetingVideoOn);
  } else {
    meetingMicOn = !meetingMicOn;
    document.getElementById('opt-mic-on')?.classList.toggle('active', meetingMicOn);
  }
}

function copyMeetingId() {
  if (!currentMeetingId) return;
  navigator.clipboard.writeText(currentMeetingId);
  showToast('Meeting ID copied!', 'success');
}

async function startMeeting() {
  const topic = document.getElementById('meeting-topic').value.trim() || 'Instant Meeting';
  closeModal('modal-new-meeting');
  try {
    // Save meeting to Firestore
    await db.collection('meetings').doc(currentMeetingId).set({
      id: currentMeetingId,
      topic,
      hostId: currentUser.uid,
      hostName: currentUserData?.displayName || 'Host',
      participants: [currentUser.uid],
      status: 'active',
      videoOn: meetingVideoOn,
      micOn: meetingMicOn,
      startedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    callData = { roomId: currentMeetingId, type: meetingVideoOn ? 'video' : 'audio', calleeName: topic, calleeId: null };
    localStream = await navigator.mediaDevices.getUserMedia({ video: meetingVideoOn, audio: meetingMicOn }).catch(() =>
      navigator.mediaDevices.getUserMedia({ video: false, audio: true }).catch(() => null));
    openCallOverlay(topic, meetingVideoOn ? 'video' : 'audio', currentMeetingId, true);
    showToast(`Meeting started · ID: ${formatMeetingId(currentMeetingId)}`, 'success');
  } catch (e) { showToast('Failed to start meeting: ' + e.message, 'error'); }
}

async function joinMeeting() {
  const idRaw = document.getElementById('join-meeting-id').value.trim().replace(/-/g, '').toUpperCase();
  const displayName = document.getElementById('join-display-name').value.trim();
  if (!idRaw) return showToast('Enter a meeting ID', 'error');
  closeModal('modal-join');
  try {
    const snap = await db.collection('meetings').doc('ZO-' + idRaw).get();
    if (!snap.exists || snap.data().status !== 'active') {
      return showToast('Meeting not found or has ended', 'error');
    }
    const data = snap.data();
    await db.collection('meetings').doc(data.id).update({
      participants: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
    });
    callData = { roomId: data.id, type: data.videoOn ? 'video' : 'audio', calleeName: data.topic, calleeId: data.hostId };
    localStream = await navigator.mediaDevices.getUserMedia({ video: data.videoOn, audio: true }).catch(() =>
      navigator.mediaDevices.getUserMedia({ video: false, audio: true }).catch(() => null));
    openCallOverlay(data.topic, data.videoOn ? 'video' : 'audio', data.id, false);
    showToast(`Joined: ${data.topic}`, 'success');
  } catch (e) { showToast('Failed to join: ' + e.message, 'error'); }
}

async function scheduleMeeting() {
  const topic = document.getElementById('sched-topic').value.trim();
  const date = document.getElementById('sched-date').value;
  const time = document.getElementById('sched-time').value;
  const duration = document.getElementById('sched-duration').value;
  const desc = document.getElementById('sched-desc').value.trim();
  if (!topic || !date || !time) return showToast('Fill in all required fields', 'error');
  const startDateTime = new Date(`${date}T${time}`);
  if (startDateTime < new Date()) return showToast('Please pick a future date and time', 'error');
  try {
    const meetId = genId('ZO-');
    await db.collection('meetings').doc(meetId).set({
      id: meetId,
      topic,
      description: desc,
      hostId: currentUser.uid,
      hostName: currentUserData?.displayName || 'Host',
      participants: [currentUser.uid],
      status: 'scheduled',
      scheduledAt: firebase.firestore.Timestamp.fromDate(startDateTime),
      duration: parseInt(duration),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    closeModal('modal-schedule');
    showToast(`Meeting scheduled for ${startDateTime.toLocaleString()}`, 'success');
    loadUpcomingMeetings();
  } catch (e) { showToast('Failed to schedule', 'error'); }
}

async function loadUpcomingMeetings() {
  if (!currentUser) return;
  try {
    const now = new Date();
    const snap = await db.collection('meetings')
      .where('hostId', '==', currentUser.uid)
      .where('status', '==', 'scheduled')
      .orderBy('scheduledAt', 'asc')
      .limit(5)
      .get();
    const meetings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderUpcomingMeetings(meetings);
  } catch (e) {}
}

function renderUpcomingMeetings(meetings) {
  const list = document.getElementById('upcoming-meetings-list');
  if (!list) return;
  if (!meetings.length) {
    list.innerHTML = `<div class="empty-state" style="padding:24px 20px">
      <div class="empty-icon"><i data-lucide="calendar" style="width:28px;height:28px"></i></div>
      <div class="empty-title">No upcoming meetings</div>
      <div class="empty-desc">Schedule a meeting to see it here</div>
    </div>`;
    lucide.createIcons({ nodes: [list] });
    return;
  }
  list.innerHTML = meetings.map(m => {
    const dt = m.scheduledAt?.toDate ? m.scheduledAt.toDate() : new Date();
    return `
    <div class="meeting-item">
      <div class="meeting-icon"><i data-lucide="video" style="width:20px;height:20px"></i></div>
      <div style="flex:1">
        <div class="meeting-title">${m.topic}</div>
        <div class="meeting-meta">${dt.toLocaleString([], { weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })} · ${m.duration}min</div>
      </div>
      <div class="meeting-actions">
        <button class="btn btn-secondary" style="font-size:12px;padding:6px 12px" onclick="copyMeetingLink('${m.id}')">
          <i data-lucide="copy" style="width:13px;height:13px"></i>Copy link
        </button>
        <button class="btn btn-primary" style="font-size:12px;padding:6px 12px" onclick="startScheduledMeeting('${m.id}')">Start</button>
      </div>
    </div>`;
  }).join('');
  lucide.createIcons({ nodes: [list] });
}

async function startScheduledMeeting(id) {
  await db.collection('meetings').doc(id).update({ status: 'active', startedAt: firebase.firestore.FieldValue.serverTimestamp() });
  callData = { roomId: id, type: 'video', calleeName: 'Meeting', calleeId: null };
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }).catch(() => null);
  openCallOverlay('Meeting', 'video', id, true);
}

function copyMeetingLink(id) {
  navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?join=${id}`);
  showToast('Meeting link copied!', 'success');
}
