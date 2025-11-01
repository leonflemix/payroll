// Filename: utils.js
import { state, db } from './state.js';
import { ENABLE_CAMERA, timecards_audit_logs_path } from './constants.js';
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { renderUI } from './uiRender.js'; // Will be defined below

/*
|--------------------------------------------------------------------------
| GENERAL UTILITIES
|--------------------------------------------------------------------------
*/

export function setMessage(text, type = 'success') {
    state.message = { text, type };
    renderUI();
    setTimeout(() => {
        state.message = null;
        renderUI();
    }, 5000);
}

export function formatTimestamp(timestamp, includeDate = true) {
    if (!timestamp) return 'N/A';
    const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
    const timePart = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (!includeDate) return timePart;
    return date.toLocaleDateString() + ' ' + timePart;
}

export function toDatetimeLocal(timestamp) {
    if (!timestamp) return '';
    const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Returns a unique week key (YYYY-WW) based on the ISO week date standard.
 */
export function getWeekNumber(d) {
    d = new Date(d); // Clone the date to prevent modification
    d.setHours(0, 0, 0, 0);
    // Thursday in current week decides the year.
    d.setDate(d.getDate() + 3 - (d.getDay() || 7));
    // January 4 is always in week 1.
    const week1 = new Date(d.getFullYear(), 0, 4);
    // Adjust to Thursday and get days in between.
    const weekNo = 1 + Math.ceil((((d - week1) / 86400000) - 3 + (week1.getDay() || 7)) / 7);
    return d.getFullYear() + '-' + String(weekNo).padStart(2, '0');
}

export function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else {
        setMessage("Your browser does not support downloading files.", 'error');
    }
}

// Function to write audit logs
export async function writeAuditLog(action, targetLogId, oldData, newData = null) {
    if (!state.currentUser || !state.currentUser.isAdmin) return; 

    try {
        const auditRef = collection(db, timecards_audit_logs_path);
        await addDoc(auditRef, {
            timestamp: new Date(),
            adminUid: state.currentUser.uid,
            adminEmail: state.currentUser.email,
            action: action, // 'EDIT' or 'DELETE'
            targetLogId: targetLogId,
            oldData: oldData, // Full log data before change
            newData: newData, // New data after change (only for EDIT)
        });
    } catch (error) {
        console.error("Failed to write audit log:", error);
    }
}

/*
|--------------------------------------------------------------------------
| CAMERA FUNCTIONS
|--------------------------------------------------------------------------
*/

export async function startCamera() {
    const video = document.getElementById('video-feed');
    if (!video) return;

    if (!ENABLE_CAMERA) {
        document.getElementById('camera-status').textContent = 'Camera disabled by admin.';
        return;
    }

    if (state.videoStream) stopCamera();
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 400, height: 300 } });
        state.videoStream = stream;
        video.srcObject = stream;
        video.play();
        document.getElementById('camera-status').textContent = 'Camera ready';
    } catch (err) {
        console.error("Error accessing camera:", err);
        document.getElementById('camera-status').textContent = 'Camera blocked or unavailable.';
    }
}

export function stopCamera() {
    if (!ENABLE_CAMERA) return;
    if (state.videoStream) {
        state.videoStream.getTracks().forEach(track => track.stop());
        state.videoStream = null;
    }
}

export function capturePhoto() {
    if (!ENABLE_CAMERA) return '';
    const video = document.getElementById('video-feed');
    if (!video || !state.videoStream) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
}

// Re-export all window functions for global access in HTML
// NOTE: renderUI is defined in uiRender.js but imported here for circular dependency resolution.
export * from './uiRender.js'; 
