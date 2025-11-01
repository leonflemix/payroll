// Filename: uiRender.js
import { state } from './state.js';
import { updateEmployee, deleteEmployee, handleLogSave, handleLogDelete, generatePayrollReport, toggleSignupModal, toggleLogModal, toggleSettingsModal, applyFilters } from './adminCrud.js';
import { handleClockAction, handleLogin } from './kioskLogic.js';
import { formatTimestamp, calculateShiftTime, formatTime, formatTotalHours, pcmToWav, base64ToArrayBuffer } from './utils.js';

/*
|--------------------------------------------------------------------------
| 1. CORE UI RENDERING
|--------------------------------------------------------------------------
*/

/**
 * Main function to render the UI based on the current state.
 */
export function renderUI() {
    try {
        const appContainer = document.getElementById('app-container');
        if (!appContainer) return;

        // Apply dark mode based on state.
        if (state.isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }

        // Display Auth status message
        const authStatus = document.getElementById('auth-status');
        if (state.isAuthReady && state.currentUser) {
            authStatus.innerHTML = `Signed in as: ${state.currentUser.email} (${state.currentUser.name})`;
            authStatus.classList.remove('text-red-500');
            authStatus.classList.add('text-green-500');
        } else if (state.isAuthReady) {
            authStatus.innerHTML = `Please login.`;
            authStatus.classList.add('text-red-500');
            authStatus.classList.remove('text-green-500');
        } else {
            authStatus.innerHTML = `Connecting to Firebase...`;
            authStatus.classList.remove('text-red-500', 'text-green-500');
        }
        
        // Render login/logout button
        document.getElementById('logout-button').classList.toggle('hidden', !state.currentUser);
        document.getElementById('login-form-container').classList.toggle('hidden', !!state.currentUser);


        // --- Render Kiosk View ---
        if (state.currentView === 'kiosk' && state.currentUser) {
            renderKiosk();
        }

        // --- Render Admin Dashboard ---
        if (state.currentView === 'admin_dashboard') {
            // The Admin Dashboard rendering functions will run here
            renderEmployeeList();
            renderTimeLogList();
            renderAuditLogList();

            // Display Admin Dashboard Error
            const adminErrorEl = document.getElementById('admin-error-message');
            if (state.adminError) {
                adminErrorEl.textContent = `CRITICAL ERROR: ${state.adminError}`;
                adminErrorEl.classList.remove('hidden');
            } else {
                adminErrorEl.classList.add('hidden');
            }
        }
        
        // Always render the main navigation/header elements regardless of view
        const headerUserName = document.getElementById('header-user-name');
        if (headerUserName) {
            headerUserName.textContent = state.currentUser ? state.currentUser.name : '';
        }

    } catch (error) {
        // CRITICAL: If renderUI fails, this logs the exact component/line that caused the crash.
        console.error("FATAL UI RENDERING ERROR. App is unstable:", error);
    }
}

/*
|--------------------------------------------------------------------------
| 2. KIOSK VIEW RENDERING
|--------------------------------------------------------------------------
*/

/**
 * Renders the employee Kiosk interface and recent activity.
 */
export function renderKiosk() {
    if (!state.currentUser) return;

    const kioskStatus = document.getElementById('kiosk-status');
    const clockButton = document.getElementById('clock-button');
    const recentActivity = document.getElementById('recent-activity-list');
    const nameDisplay = document.getElementById('kiosk-user-name');
    const currentStatus = state.currentUser.status || 'out';

    // Update Name and Status
    nameDisplay.textContent = state.currentUser.name;

    if (currentStatus === 'in') {
        kioskStatus.textContent = 'Clocked In';
        kioskStatus.classList.remove('bg-gray-200');
        kioskStatus.classList.add('bg-green-500', 'text-white');
        clockButton.textContent = 'Clock Out';
        clockButton.classList.remove('bg-green-500');
        clockButton.classList.add('bg-red-500', 'hover:bg-red-600');
        clockButton.setAttribute('data-action', 'out');
    } else {
        kioskStatus.textContent = 'Clocked Out';
        kioskStatus.classList.remove('bg-green-500', 'text-white');
        kioskStatus.classList.add('bg-gray-200');
        clockButton.textContent = 'Clock In';
        clockButton.classList.remove('bg-red-500');
        clockButton.classList.add('bg-green-500', 'hover:bg-green-600');
        clockButton.setAttribute('data-action', 'in');
    }

    // --- Render Recent Activity ---
    if (recentActivity) {
        recentActivity.innerHTML = state.currentUserLogs.map(log => `
            <li class="flex justify-between items-center py-2 px-3 border-b last:border-b-0">
                <span class="${log.type === 'in' ? 'text-green-600' : 'text-red-600'} font-semibold">${log.type.toUpperCase()}</span>
                <span class="text-sm text-gray-600">${formatTimestamp(log.timestamp)}</span>
            </li>
        `).join('');
        if (state.currentUserLogs.length === 0) {
            recentActivity.innerHTML = '<li class="p-3 text-center text-gray-500">No recent activity.</li>';
        }
    }
}

/*
|--------------------------------------------------------------------------
| 3. ADMIN DASHBOARD RENDERING
|--------------------------------------------------------------------------
*/

/**
 * Renders the Employee Management table.
 */
export function renderEmployeeList() {
    const tableBody = document.getElementById('employee-list-body');
    if (!tableBody || !state.allEmployees) return;

    const employees = Object.values(state.allEmployees).sort((a, b) => a.name.localeCompare(b.name));

    tableBody.innerHTML = employees.map(emp => `
        <tr class="border-b hover:bg-gray-50 ${emp.isAdmin ? 'bg-yellow-50/50' : ''}">
            <td class="px-6 py-3 font-medium text-gray-900">${emp.name}</td>
            <td class="px-6 py-3 text-gray-600">${emp.email}</td>
            <td class="px-6 py-3 text-sm">${emp.uid}</td>
            <td class="px-6 py-3 text-sm">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${emp.isAdmin ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}">
                    ${emp.isAdmin ? 'Admin' : 'Employee'}
                </span>
            </td>
            <td class="px-6 py-3 text-sm text-center">
                <span class="inline-flex items-center">
                    <span class="h-3 w-3 rounded-full mr-2 ${emp.status === 'in' ? 'bg-green-500' : 'bg-red-500'}"></span>
                    ${emp.status.toUpperCase()}
                </span>
            </td>
            <td class="px-6 py-3 whitespace-nowrap text-right text-sm font-medium">
                <button onclick="toggleSettingsModal('${emp.uid}')" class="text-indigo-600 hover:text-indigo-900 mr-3">Edit Settings</button>
                <button onclick="toggleSignupModal('${emp.uid}')" class="text-blue-600 hover:text-blue-900 mr-3">Edit Name/Email</button>
                <button onclick="deleteEmployee('${emp.uid}')" class="text-red-600 hover:text-red-900">Delete</button>
            </td>
        </tr>
    `).join('');
}


/**
 * Renders the Time Log Management table, filtered by current admin settings.
 */
export function renderTimeLogList() {
    const tableBody = document.getElementById('log-list-body');
    const employeeFilter = document.getElementById('filter-employee');
    const startDateFilter = document.getElementById('filter-start-date');
    const endDateFilter = document.getElementById('filter-end-date');
    if (!tableBody || !state.allLogs || !state.allEmployees) return;

    // --- Populate Employee Filter Dropdown ---
    if (employeeFilter && employeeFilter.children.length <= 1) { // Only populate once
        const employees = Object.values(state.allEmployees).sort((a, b) => a.name.localeCompare(b.name));
        employeeFilter.innerHTML = '<option value="">All Employees</option>' + employees.map(emp =>
            `<option value="${emp.uid}">${emp.name}</option>`
        ).join('');
        // Re-set the selected value if it exists in state
        if (state.filterEmployeeUid) {
            employeeFilter.value = state.filterEmployeeUid;
        }
    }

    // --- Apply Filtering ---
    let filteredLogs = state.allLogs;

    // Filter by Employee UID
    if (state.filterEmployeeUid) {
        filteredLogs = filteredLogs.filter(log => log.employeeUid === state.filterEmployeeUid);
    }

    // Filter by Date Range
    const startDate = startDateFilter.value ? new Date(startDateFilter.value) : null;
    const endDate = endDateFilter.value ? new Date(endDateFilter.value) : null;

    if (startDate) {
        // Start date should include the entire day, so we compare against start of day
        const startTimestamp = startDate.getTime();
        filteredLogs = filteredLogs.filter(log => log.timestamp.toMillis() >= startTimestamp);
    }

    if (endDate) {
        // End date should include the entire day, up to the last millisecond
        const endTimestamp = endDate.getTime() + 86400000; // Add 24 hours
        filteredLogs = filteredLogs.filter(log => log.timestamp.toMillis() < endTimestamp);
    }
    
    // Sort by timestamp descending (newest first)
    filteredLogs.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());

    tableBody.innerHTML = filteredLogs.map(log => {
        const employee = state.allEmployees[log.employeeUid] || { name: 'Unknown', email: 'N/A' };
        const hasPhoto = !!log.photo;

        return `
            <tr class="border-b hover:bg-gray-50">
                <td class="px-6 py-3 font-medium text-gray-900">${employee.name}</td>
                <td class="px-6 py-3 text-sm">${formatTimestamp(log.timestamp)}</td>
                <td class="px-6 py-3">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${log.type === 'in' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                        ${log.type.toUpperCase()}
                    </span>
                </td>
                <td class="px-6 py-3 text-center">
                    ${hasPhoto ? 
                        `<button onclick="showPhotoModal('${log.photo}')" class="text-blue-600 hover:text-blue-900 text-sm">View Photo</button>` :
                        `<span class="inline-flex items-center text-red-500 text-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 mr-1">
                                <path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.288 5.711A.75.75 0 0 0 7.5 6.444v7.112a.75.75 0 0 0 1.288.536l4.632-3.556a.75.75 0 0 0 0-1.293L8.788 5.711Z" clip-rule="evenodd" />
                            </svg>
                            N/A
                        </span>`
                    }
                </td>
                <td class="px-6 py-3 whitespace-nowrap text-right text-sm font-medium">
                    <button onclick="toggleLogModal('${log.id}', '${log.type}')" class="text-indigo-600 hover:text-indigo-900 mr-3">Edit</button>
                    <button onclick="handleLogDelete('${log.id}')" class="text-red-600 hover:text-red-900">Delete</button>
                </td>
            </tr>
        `;
    }).join('');

    if (filteredLogs.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-gray-500">No time logs found for the current filters.</td></tr>';
    }
}

/**
 * Renders the Audit Log History table.
 */
export function renderAuditLogList() {
    const tableBody = document.getElementById('audit-log-body');
    if (!tableBody || !state.auditLogs || !state.allEmployees) return;

    // Sort by timestamp descending (newest first) and take the last 10
    const recentLogs = state.auditLogs
        .sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis())
        .slice(0, 10);

    tableBody.innerHTML = recentLogs.map(log => {
        const admin = state.allEmployees[log.adminUid] || { name: 'Unknown Admin' };
        const targetEmployee = state.allEmployees[log.targetUid] || { name: 'N/A' };
        const actionType = log.action === 'EDIT' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800';
        
        return `
            <tr class="border-b hover:bg-gray-50">
                <td class="px-6 py-3 text-sm">${formatTimestamp(log.timestamp)}</td>
                <td class="px-6 py-3 font-medium text-gray-900">${admin.name}</td>
                <td class="px-6 py-3 text-sm">${targetEmployee.name}</td>
                <td class="px-6 py-3">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${actionType}">
                        ${log.action}
                    </span>
                </td>
                <td class="px-6 py-3 text-sm text-gray-600 truncate max-w-xs">${log.details}</td>
            </tr>
        `;
    }).join('');
    
    if (recentLogs.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-gray-500">No audit activity yet.</td></tr>';
    }
}

/*
|--------------------------------------------------------------------------
| 4. MODAL CONTROLS
|--------------------------------------------------------------------------
*/

export function closeSignupModal() {
    document.getElementById('employee-signup-modal').classList.add('hidden');
}

export function closeLogModal() {
    document.getElementById('log-modal').classList.add('hidden');
}

export function showPhotoModal(base64Image) {
    const modal = document.getElementById('photo-modal');
    const imgEl = document.getElementById('photo-display');
    if (modal && imgEl) {
        imgEl.src = base64Image;
        modal.classList.remove('hidden');
    }
}

export function closePhotoModal() {
    document.getElementById('photo-modal').classList.add('hidden');
}

export function closeSettingsModal() {
    document.getElementById('employee-settings-modal').classList.add('hidden');
}

export function applyFilters() {
    renderTimeLogList();
}
