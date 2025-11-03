// Filename: utils.js
import { state } from './state.js';
import { renderUI } from './uiRender.js';

/*
|--------------------------------------------------------------------------
| 1. CAMERA AND MEDIA UTILITIES (Exported)
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

/**
 * Converts a Base64 string (without the MIME prefix) into an ArrayBuffer.
 * This is used to decode the captured photo data for display.
 * @param {string} base64 - Base64 string of the image.
 * @returns {ArrayBuffer}
 */
export function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64.split(',')[1] || base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

/*
|--------------------------------------------------------------------------
| 2. DATE AND TIME UTILITIES (Exported)
|--------------------------------------------------------------------------
*/

/**
 * Calculates the total time, regular time, and overtime for a single shift.
 * Applies break deduction and daily overtime rules based on employee settings.
 * @param {Object} logEntry - Paired in/out log entry.
 * @param {Object} employee - The employee's settings (maxDailyHours, breakDeductionMins).
 * @returns {{totalHours: number, regularHours: number, dailyOT: number, weeklyOT: number}}
 */
export function calculateShiftTime(logEntry, employee) {
    if (!logEntry.timeIn || !logEntry.timeOut) {
        return { totalHours: 0, regularHours: 0, dailyOT: 0, weeklyOT: 0 };
    }

    const timeIn = logEntry.timeIn.toDate().getTime();
    const timeOut = logEntry.timeOut.toDate().getTime();
    
    // Total duration in milliseconds
    let durationMs = timeOut - timeIn;
    if (durationMs < 0) durationMs = 0; // Should not happen

    let totalHours = durationMs / (1000 * 60 * 60);

    // Apply Break Deduction Logic
    const breakTriggerHours = 6;
    if (totalHours > breakTriggerHours) {
        // Deduction is applied only if the shift exceeds the trigger threshold
        totalHours -= (employee.breakDeductionMins / 60);
    }

    const maxDailyHours = employee.maxDailyHours || 8;
    let regularHours = totalHours;
    let dailyOT = 0;
    
    // Daily Overtime Calculation
    if (totalHours > maxDailyHours) {
        dailyOT = totalHours - maxDailyHours;
        regularHours = maxDailyHours;
    }

    // Weekly OT is calculated in the adminCrud.js, so we leave it at 0 here.
    return {
        totalHours: totalHours,
        regularHours: regularHours,
        dailyOT: dailyOT,
        weeklyOT: 0
    };
}


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

/**
 * Converts PCM audio data to WAV format.
 * @param {Float32Array} pcmData - The PCM data to convert.
 * @returns {ArrayBuffer} - The WAV file data as an ArrayBuffer.
 */
export default function pcmToWav(pcmData) {
    // WAV file header fields
    const sampleRate = 44100;
    const numChannels = 1;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcmData.length * bytesPerSample;
    const fileSize = 44 + dataSize; // 44 bytes for WAV header

    // Create an ArrayBuffer for the WAV file
    const wavBuffer = new ArrayBuffer(fileSize);
    const view = new DataView(wavBuffer);

    // Write the WAV file header
    let offset = 0;
    function writeString(str) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset++, str.charCodeAt(i) & 0xFF);
        }
    }
    writeString('RIFF');                        // ChunkID
    view.setUint32(4, fileSize - 8, true);    // ChunkSize
    writeString('WAVE');                        // Format
    writeString('fmt ');                       // Subchunk1ID
    view.setUint32(16, 16, true);             // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true);              // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true);    // NumChannels
    view.setUint32(24, sampleRate, true);     // SampleRate
    view.setUint32(28, byteRate, true);       // ByteRate
    view.setUint16(32, blockAlign, true);     // BlockAlign
    view.setUint16(34, bytesPerSample * 8, true); // BitsPerSample
    writeString('data');                       // Subchunk2ID
    view.setUint32(40, dataSize, true);       // Subchunk2Size

    // Write the PCM data
    offset = 44;
    for (let i = 0; i < pcmData.length; i++) {
        view.setInt16(offset, pcmData[i] * 32767, true);
        offset += 2;
    }

    return wavBuffer;
}
