// Filename: utils.js
import { state } from './state.js';
import { timecards_audit_logs_path } from './constants.js';
import { addDoc, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/*
|--------------------------------------------------------------------------
| 1. DATE & TIME UTILITIES
|--------------------------------------------------------------------------
*/

export function formatTime(timestamp) {
    if (!timestamp || typeof timestamp.toDate !== 'function') return 'N/A';
    return timestamp.toDate().toLocaleTimeString();
}

export function formatDate(timestamp) {
    if (!timestamp || typeof timestamp.toDate !== 'function') return 'N/A';
    return timestamp.toDate().toLocaleDateString();
}

export function getDateTimeInput(timestamp) {
    if (!timestamp || typeof timestamp.toDate !== 'function') return { date: '', time: '' };
    const date = timestamp.toDate();
    const YYYY = date.getFullYear();
    const MM = String(date.getMonth() + 1).padStart(2, '0');
    const DD = String(date.getDate()).padStart(2, '0');
    const HH = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return {
        date: `${YYYY}-${MM}-${DD}`,
        time: `${HH}:${mm}:${ss}`
    };
}

/*
|--------------------------------------------------------------------------
| 2. CAMERA/PHOTO UTILITIES
|--------------------------------------------------------------------------
*/

const video = document.getElementById('webcam-feed');
const canvas = document.getElementById('photo-canvas');

export function startCamera() {
    if (!navigator.mediaDevices) return; // Cannot start camera without media devices API

    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            if (video) {
                video.srcObject = stream;
                video.play();
                document.getElementById('camera-section').classList.remove('hidden');
            }
        })
        .catch(err => {
            console.warn("Camera access denied or failed:", err);
            // Hide the camera section if access is denied
            document.getElementById('camera-section').classList.add('hidden');
        });
}

export function stopCamera() {
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
    }
    // Ensure camera section is hidden when not in kiosk view
    if (document.getElementById('camera-section')) {
        document.getElementById('camera-section').classList.add('hidden');
    }
}

export function captureImage() {
    if (!video || !canvas) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert canvas image to Base64 data URL
    return canvas.toDataURL('image/png');
}

/*
|--------------------------------------------------------------------------
| 3. AUDIT LOGGING
|--------------------------------------------------------------------------
*/

/**
 * Writes an administrative action to the audit log collection.
 * @param {string} action - e.g., 'EDIT_LOG', 'DELETE_EMPLOYEE', 'ADD_EMPLOYEE'
 * @param {string} target - Employee name or log ID being acted upon.
 * @param {object} details - Details of the change (e.g., old/new values).
 */
export async function writeAuditLog(action, target, details = {}) {
    if (!state.db || !state.currentUser) return;

    try {
        const logEntry = {
            timestamp: new Date(),
            adminUid: state.currentUser.uid,
            adminName: state.currentUser.name || 'Admin User',
            action: action,
            target: target,
            details: JSON.stringify(details)
        };
        await addDoc(collection(state.db, timecards_audit_logs_path), logEntry);
    } catch (error) {
        console.error("Failed to write audit log:", error);
    }
}
