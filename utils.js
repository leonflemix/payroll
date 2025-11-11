// Filename: utils.js
import { state } from './state.js';

/*
|--------------------------------------------------------------------------
| 1. CAMERA AND MEDIA UTILITIES (REMOVED)
|--------------------------------------------------------------------------
| All functions related to the camera (startCamera, stopCamera, takePhoto, etc.)
| have been removed for stability.
*/

/*
|--------------------------------------------------------------------------
| 2. DATE AND TIME UTILITIES (Exported)
|--------------------------------------------------------------------------
*/

/**
 * Calculates the total time, regular time, and overtime for a single shift.
 * Applies break deduction and daily overtime rules based on employee settings.
 * @param {Object} logEntry - Paired in/out log entry (timeIn/timeOut are Date objects).
 * @param {Object} employee - The employee's settings (maxDailyHours, breakDeductionMins).
 * @returns {{totalHours: number, regularHours: number, dailyOT: number, weeklyOT: number}}
 */
export function calculateShiftTime(logEntry, employee) {
    if (!logEntry.timeIn || !logEntry.timeOut) {
        return { totalHours: 0, regularHours: 0, dailyOT: 0, weeklyOT: 0 };
    }

    const timeIn = logEntry.timeIn.getTime();
    const timeOut = logEntry.timeOut.getTime();
    
    let durationMs = timeOut - timeIn;
    if (durationMs < 0) durationMs = 0;

    let totalHours = durationMs / (1000 * 60 * 60);

    // Apply Break Deduction Logic (only if shift > 6 hours)
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
        year: 'numeric', month: 'short', day: 'numeric',
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
    if (typeof hours !== 'number' || isNaN(hours)) return '0.00';
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
 * Converts PCM audio buffer to WAV format.
 * @param {Float32Array} pcmBuffer - The PCM audio buffer.
 * @param {number} sampleRate - The sample rate of the audio.
 * @returns {ArrayBuffer} - The WAV formatted audio data.
 */
export function pcmToWav(pcmBuffer, sampleRate) {
  // implementation...
}