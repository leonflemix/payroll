// Filename: utils.js
import { state } from './state.js';
import { renderUI } from './uiRender.js';

/*
|--------------------------------------------------------------------------
| 1. CAMERA AND MEDIA UTILITIES
|--------------------------------------------------------------------------
*/

/**
 * Starts the video stream from the user's camera.
 * @param {HTMLVideoElement} videoElement - The video element to display the stream.
 */
export function startCamera(videoElement) {
    if (!state.ENABLE_CAMERA) return;
    
    try {
        if (state.mediaStream) {
            stopCamera();
        }

        const constraints = { video: { facingMode: "user" } };

        navigator.mediaDevices.getUserMedia(constraints)
            .then(stream => {
                state.mediaStream = stream;
                videoElement.srcObject = stream;
                videoElement.play();
                console.log("Camera stream started.");
            })
            .catch(err => {
                console.error("Error accessing camera:", err);
                state.mediaStream = null;
                // Update UI to reflect camera failure, if necessary
            });
    } catch (e) {
        console.error("Camera access failed in try-catch:", e);
        state.mediaStream = null;
    }
}

/**
 * Stops the video stream and releases the camera resource.
 */
export function stopCamera() {
    if (state.mediaStream) {
        state.mediaStream.getTracks().forEach(track => track.stop());
        state.mediaStream = null;
        console.log("Camera stream stopped.");
    }
}

/**
 * Captures a frame from the video stream and returns it as a Base64 string.
 * @param {HTMLVideoElement} videoElement - The video element to capture from.
 * @returns {string|null} Base64 image string or null if capture fails.
 */
export function takePhoto(videoElement) {
    if (!state.mediaStream) return null;

    try {
        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        
        const context = canvas.getContext('2d');
        context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

        // Convert canvas image to Base64 string
        const dataURL = canvas.toDataURL('image/jpeg', 0.8);
        return dataURL;
    } catch (error) {
        console.error("Photo capture failed:", error);
        return null;
    }
}

/*
|--------------------------------------------------------------------------
| 2. DATE AND TIME UTILITIES (Exported)
|--------------------------------------------------------------------------
*/

/**
 * Formats a Firebase Timestamp object into a readable date and time string.
 * Used for displaying recent activity and audit logs.
 * @param {Object} timestamp - Firebase Timestamp object.
 * @returns {string} Formatted date/time string.
 */
export function formatTimestamp(timestamp) {
    if (!timestamp || typeof timestamp.toDate !== 'function') return 'N/A';
    const date = timestamp.toDate();
    const options = {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    };
    return date.toLocaleTimeString('en-US', options);
}

/**
 * Formats a standard Date object into a readable time string (e.g., 9:00 AM).
 * Used primarily for payroll reports.
 * @param {Date} date - Standard Date object.
 * @returns {string} Formatted time string.
 */
export function formatTime(date) {
    if (!(date instanceof Date)) return 'N/A';
    const options = { hour: '2-digit', minute: '2-digit', hour12: true };
    return date.toLocaleTimeString('en-US', options);
}

/**
 * Formats a duration in hours (decimal) to a fixed two-decimal string.
 * Used primarily for payroll reports.
 * @param {number} hours - Duration in decimal hours.
 * @returns {string} Formatted duration string.
 */
export function formatTotalHours(hours) {
    if (typeof hours !== 'number') return '0.00';
    return hours.toFixed(2);
}

/*
|--------------------------------------------------------------------------
| 3. MISCELLANEOUS UTILITIES
|--------------------------------------------------------------------------
*/

/**
 * Utility to execute a delay.
 * @param {number} ms - Milliseconds to delay.
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
