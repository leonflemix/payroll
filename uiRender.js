// Filename: uiRender.js
import { state } from './state.js';
import { 
    ADMIN_EMAIL, 
    ENABLE_CAMERA 
} from './constants.js';
import { 
    formatTimestamp, 
    startCamera, 
    showPhotoModal,
    closePhotoModal 
} from './utils.js';

import { 
    navigateTo, 
    handleClockAction, 
    handleAdminLogin, 
    handleLogin 
} from './kioskLogic.js';

import { 
    showSignupModal, 
    handleEmployeeSignup, 
    handleEmployeeDelete, 
    updateAdminLogFilters, 
    generatePayrollReport, 
    showLogModal, 
    getFilteredLogs,
    handleLogSave,
    handleLogDelete
} from './adminCrud.js';

// Expose these functions globally so the HTML onclick handlers work
window.navigateTo = navigateTo;
window.handleClockAction = handleClockAction;
window.handleAdminLogin = handleAdminLogin;
window.handleLogin = handleLogin;
window.showSignupModal = showSignupModal;
window.handleEmployeeSignup = handleEmployeeSignup;
window.handleEmployeeDelete = handleEmployeeDelete;
window.updateAdminLogFilters = updateAdminLogFilters;
window.generatePayrollReport = generatePayrollReport;
window.showLogModal = showLogModal;
window.handleLogSave = handleLogSave;
window.handleLogDelete = handleLogDelete;
window.showPhotoModal = showPhotoModal;
window.closePhotoModal = closePhotoModal;


export function renderUI() {
    const $appContainer = document.getElementById('app-container');

    const messageClasses = state.message?.type === 'error' 
        ? 'bg-red-500 text-white' 
        : 'bg-green-500 text-white';

    const $messageBox = document.getElementById('message-box');
    if ($messageBox) { // Ensure element exists before writing
        $messageBox.innerHTML = state.message 
            ? `<div class="p-3 text-center rounded-lg shadow-xl ${messageClasses}">${state.message.text}</div>` 
            : '';
    }

    if (state.loading || !state.isAuthReady) {
         $appContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center min-h-screen">
                <i class="fas fa-spinner fa-spin text-6xl text-indigo-600"></i>
                <p class="mt-4 text-xl font-semibold text-gray-700">Loading application data...</p>
            </div>
        `;
        return;
    }

    let contentHTML = '';

    // --- A. Login View ---
    if (state.view === 'login') {
        contentHTML = `
            <div class="max-w-md w-full p-8 space-y-6 bg-white rounded-xl shadow-2xl">
                <h2 class="text-3xl font-extrabold text-gray-900 text-center">Employee Kiosk Login</h2>
                <p class="text-sm text-center text-gray-500">Use your registered email and password.</p>
                <form onsubmit="event.preventDefault(); handleLogin();" class="space-y-4">
                    <div>
                        <label for="login-email" class="block text-sm font-medium text-gray-700">Email</label>
                        <input id="login-email" type="email" required
                            class="mt-1 block w-full py-3 px-4 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                    </div>
                    <div>
                        <label for="login-password" class="block text-sm font-medium text-gray-700">Password</label>
                        <input id="login-password" type="password" required
                            class="mt-1 block w-full py-3 px-4 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                    </div>
                    <button type="submit" class="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150">
                        Clock In / Out
                    </button>
                </form>
                <div class="text-center pt-4">
                    <button onclick="document.getElementById('admin-link-block').classList.toggle('hidden')" class="text-xs text-gray-500 hover:text-indigo-600 transition">
                        <i class="fas fa-user-shield"></i> Admin Access
                    </button>
                    <div id="admin-link-block" class="mt-2 p-3 bg-gray-100 rounded-lg hidden">
                        <p class="font-semibold text-sm mb-2">Admin Login</p>
                        <p class="text-xs text-red-500 mb-2">Admin Email: ${ADMIN_EMAIL} (Use your own password)</p>
                        <form onsubmit="event.preventDefault(); handleAdminLogin();" class="space-y-2">
                            <input id="admin-email" type="email" value="${ADMIN_EMAIL}" required class="w-full py-2 px-3 border rounded-lg text-sm" placeholder="Admin Email">
                            <input id="admin-pin" type="password" required class="w-full py-2 px-3 border rounded-lg text-sm" placeholder="Admin Password">
                            <button type="submit" class="w-full py-2 px-4 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-800 transition">
                                Go to Dashboard
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        `;
    } 

    // --- B. Kiosk View ---
    else if (state.view === 'kiosk' && state.currentUser) {
        const buttonText = state.currentUser.status === 'out' ? 'Clock In' : 'Clock Out';
        const buttonColor = state.currentUser.status === 'out' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700';

        const kioskLogHTML = state.logs.length > 0
            ? state.logs.map(log => `
                <li class="flex justify-between items-center p-3 border-b border-gray-200">
                    <span class="font-semibold text-gray-700">${log.employeeName}</span>
                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${log.type === 'in' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-800'}">
                        ${log.type.toUpperCase()}
                    </span>
                    <span class="text-sm text-gray-500">${formatTimestamp(log.timestamp, false)}</span>
                    ${log.photoData ? `<button onclick="showPhotoModal('${log.photoData}')" class="text-indigo-600 hover:text-indigo-800 ml-1"><i class="fas fa-camera"></i></button>` : `<span class="text-xs text-red-500 ml-1"><i class="fas fa-exclamation-circle"></i> N/A</span>`}
                </li>
            `).join('')
            : '<p class="text-center text-gray-500 py-4">No recent punches found. Clock in to see your activity!</p>';

        contentHTML = `
            <div class="max-w-4xl w-full p-6 space-y-6 bg-white rounded-xl shadow-2xl">
                <div class="flex justify-between items-center border-b pb-3 mb-4">
                    <h2 class="text-3xl font-bold text-gray-900">Welcome, ${state.currentUser.name}</h2>
                    <button onclick="navigateTo('login')" class="text-sm font-medium text-red-500 hover:text-red-700 transition">
                        <i class="fas fa-sign-out-alt mr-1"></i> Log Out
                    </button>
                </div>
                <p class="text-xs text-gray-500">Signed in as: ${state.currentUser.email}</p>

                <div class="grid md:grid-cols-2 gap-6">
                    <div class="flex flex-col items-center">
                        <h3 class="text-xl font-semibold mb-3 text-gray-700">Live Camera Feed</h3>
                        ${ENABLE_CAMERA ? `
                            <video id="video-feed" autoplay playsinline class="mb-4"></video>
                            <p id="camera-status" class="text-xs text-gray-500 mb-4">Starting camera...</p>
                        ` : `
                            <div class="w-full max-w-sm h-72 bg-gray-200 flex items-center justify-center rounded-xl mb-4 shadow-inner">
                                <i class="fas fa-camera-slash text-4xl text-gray-500"></i>
                            </div>
                            <p id="camera-status" class="text-xs text-red-500 mb-4">Camera feature is currently disabled.</p>
                        `}
                        <div id="kiosk-button" class="w-full">
                            <button onclick="handleClockAction()" 
                                    ${state.isClocking ? 'disabled' : ''}
                                    class="w-full text-2xl font-bold py-6 px-4 rounded-xl shadow-lg transition duration-150 ease-in-out ${buttonColor} text-white disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02]">
                                <i class="fas fa-clock mr-3"></i> 
                                ${state.isClocking ? '<i class="fas fa-spinner fa-spin"></i> Processing...' : buttonText}
                            </button>
                        </div>
                        <p class="mt-3 text-sm text-gray-500">Current Status: 
                            <span class="font-bold uppercase ${state.currentUser.status === 'in' ? 'text-green-600' : 'text-red-600'}">
                                ${state.currentUser.status}
                            </span>
                        </p>
                    </div>

                    <div>
                        <h3 class="text-xl font-semibold mb-3 text-gray-700">Recent Activity (Last 5 Punches)</h3>
                        <div class="bg-gray-50 p-4 rounded-xl shadow-inner h-96 overflow-y-auto">
                            <ul id="kiosk-log" class="divide-y divide-gray-200">
                                ${kioskLogHTML}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;
        if (ENABLE_CAMERA) {
            startCamera(); 
        }

    } 

    // --- C. Admin Dashboard View ---
    else if (state.view === 'admin_dashboard') {
        const employeeTableRows = state.employees.map(e => `
            <tr class="border-b hover:bg-indigo-50/50">
                <td class="p-3 font-semibold">${e.name}</td>
                <td class="p-3 text-sm font-mono">${e.email}</td>
                <td class="p-3">
                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${e.status === 'in' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                        ${e.status.toUpperCase()}
                    </span>
                </td>
                <td class="p-3">
                    <button onclick="handleEmployeeDelete('${e.uid}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash-alt"></i></button>
                </td>
            </tr>
        `).join('');

        const filteredLogs = getFilteredLogs();
        const logTableRows = filteredLogs.map(log => `
            <tr class="border-b hover:bg-indigo-50/50">
                <td class="p-3 font-semibold">${log.employeeName}</td>
                <td class="p-3 text-sm">
                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${log.type === 'in' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-800'}">
                        ${log.type.toUpperCase()}
                    </span>
                </td>
                <td class="p-3 text-sm">${formatTimestamp(log.timestamp)}</td>
                <td class="p-3 space-x-2">
                    <button onclick="showLogModal('${log.id}')" class="text-indigo-600 hover:text-indigo-800"><i class="fas fa-edit"></i></button>
                    ${log.photoData && ENABLE_CAMERA ? 
                        `<button onclick="showPhotoModal('${log.photoData}')" class="text-gray-600 hover:text-gray-800"><i class="fas fa-camera"></i></button>` : 
                        `<span title="Missing Photo Data" class="text-red-500"><i class="fas fa-times-circle"></i> N/A</span>`
                    }
                </td>
            </tr>
        `).join('');

        // Audit Log Rendering
        const auditLogHTML = state.auditLogs.slice(0, 10).map(log => {
            // Safety check for optional data access
            const oldType = log.oldData?.type || 'N/A';
            const newType = log.newData?.type || 'N/A';
            const oldTimestamp = log.oldData?.timestamp ? formatTimestamp(log.oldData.timestamp) : 'N/A';

            const details = log.action === 'EDIT' 
                ? `Old Type: ${oldType}, New Type: ${newType}` 
                : `Deleted Type: ${oldType}, Time: ${oldTimestamp}`;

            return `
                <li class="p-3 border-b border-gray-100 ${log.action === 'DELETE' ? 'bg-red-50' : 'bg-yellow-50'} rounded-lg mb-1">
                    <div class="flex justify-between items-center text-xs font-semibold">
                        <span class="px-2 py-1 rounded-full ${log.action === 'DELETE' ? 'bg-red-200 text-red-800' : 'bg-yellow-200 text-yellow-800'}">
                            ${log.action}
                        </span>
                        <span class="text-gray-500">${formatTimestamp(log.timestamp)}</span>
                    </div>
                    <p class="text-sm mt-1 text-gray-700">
                        Admin: ${log.adminEmail} | Target Log ID: ${log.targetLogId.substring(0, 8)}...
                    </p>
                    <p class="text-xs text-gray-500">${details}</p>
                </li>
            `;
        }).join('');


        contentHTML = `
            <div class="max-w-6xl w-full p-8 space-y-8 bg-white rounded-xl shadow-2xl">
                <div class="flex justify-between items-center border-b pb-4">
                    <h2 class="text-3xl font-bold text-gray-900"><i class="fas fa-tools mr-2"></i> Admin Dashboard</h2>
                    <button onclick="navigateTo('login')" class="py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition duration-150">
                        <i class="fas fa-sign-out-alt mr-1"></i> Log Out Admin
                    </button>
                </div>

                <!-- Payroll Report & Filter Section -->
                <div class="p-4 bg-indigo-50 rounded-xl shadow-inner space-y-3">
                    <h3 class="text-xl font-semibold text-indigo-800">Payroll Report Generation & Filtering</h3>

                    <!-- Filter Inputs -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                        <!-- Employee Filter (NEW) -->
                        <div class="flex flex-col space-y-1">
                            <label for="filter-employee-uid" class="text-sm font-medium text-gray-700">Filter Employee:</label>
                            <select id="filter-employee-uid" class="py-1 px-3 border rounded-lg shadow-sm text-sm focus:ring-indigo-500" value="${state.filterEmployeeUid || 'all'}">
                                <option value="all">All Employees</option>
                                ${state.employees.filter(e => e.email !== ADMIN_EMAIL).map(e => `
                                    <option value="${e.uid}" ${state.filterEmployeeUid === e.uid ? 'selected' : ''}>${e.name}</option>
                                `).join('')}
                            </select>
                        </div>
                        <!-- Start Date Filter -->
                        <div class="flex flex-col space-y-1">
                            <label for="filter-start-date" class="text-sm font-medium text-gray-700">Start Date:</label>
                            <input type="date" id="filter-start-date" value="${state.filterStartDate || ''}" class="py-1 px-3 border rounded-lg shadow-sm text-sm focus:ring-indigo-500">
                        </div>
                        <!-- End Date Filter -->
                        <div class="flex flex-col space-y-1">
                            <label for="filter-end-date" class="text-sm font-medium text-gray-700">End Date:</label>
                            <input type="date" id="filter-end-date" value="${state.filterEndDate || ''}" class="py-1 px-3 border rounded-lg shadow-sm text-sm focus:ring-indigo-500">
                        </div>

                        <button onclick="updateAdminLogFilters()" class="w-full py-2 px-4 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition shadow self-end">
                            <i class="fas fa-filter mr-1"></i> Apply Filter
                        </button>
                    </div>

                    <!-- Payroll Action -->
                    <div class="flex flex-col md:flex-row space-y-3 md:space-y-0 md:space-x-4 items-center pt-3">
                        <div class="flex items-center space-x-2">
                            <input type="checkbox" id="apply-break-deduction" class="form-checkbox text-indigo-600 h-5 w-5 rounded-md border-gray-300 focus:ring-indigo-500">
                            <label for="apply-break-deduction" class="text-sm font-medium text-gray-700 whitespace-nowrap">
                                Apply 30 min break deduction (shifts > 6 hrs)
                            </label>
                        </div>
                        <button onclick="generatePayrollReport()" class="w-full md:w-auto py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition duration-150">
                            <i class="fas fa-file-csv mr-1"></i> Generate Filtered CSV
                        </button>
                    </div>
                    <p class="text-xs text-indigo-600 pt-1">The Payroll CSV and Time Log table below use the applied filters.</p>
                </div>


                <!-- Employee Management Section -->
                <div class="space-y-4">
                    <div class="flex justify-between items-center">
                        <h3 class="text-xl font-semibold text-gray-700"><i class="fas fa-users mr-1"></i> Employee Management (${state.employees.length} Total)</h3>
                        <button onclick="showSignupModal()" class="py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition duration-150">
                            <i class="fas fa-user-plus mr-1"></i> Sign Up Employee
                        </button>
                    </div>
                    <div class="overflow-x-auto shadow-lg rounded-xl border border-gray-200">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr class="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    <th class="p-3">Name</th>
                                    <th class="p-3">Email</th>
                                    <th class="p-3">Current Status</th>
                                    <th class="p-3">Delete</th>
                                </tr>
                            </thead>
                            <tbody id="employee-table-body" class="bg-white divide-y divide-gray-200">
                                ${employeeTableRows}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Time Log Management Section -->
                <div class="space-y-4">
                    <h3 class="text-xl font-semibold text-gray-700"><i class="fas fa-history mr-1"></i> Time Log Management (${filteredLogs.length} Filtered Logs)</h3>
                    <div class="overflow-x-auto shadow-lg rounded-xl border border-gray-200">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr class="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    <th class="p-3">Employee</th>
                                    <th class="p-3">Type</th>
                                    <th class="p-3">Timestamp</th>
                                    <th class="p-3">Actions / Photo</th>
                                </tr>
                            </thead>
                            <tbody id="log-table-body" class="bg-white divide-y divide-gray-200">
                                ${logTableRows}
                            </tbody>
                        </table>
                    </div>
                    ${filteredLogs.length === 0 ? `<p class="text-center text-gray-500 py-4">No logs found for the applied filter range.</p>` : ''}
                </div>

                <!-- Audit History Section (NEW) -->
                <div class="space-y-4">
                    <h3 class="text-xl font-semibold text-gray-700"><i class="fas fa-clipboard-list mr-1"></i> Audit History (Last 10 Admin Changes)</h3>
                    <div class="bg-gray-100 p-4 rounded-xl shadow-inner border border-gray-200 h-80 overflow-y-auto">
                        <ul id="audit-log-list" class="space-y-2">
                            ${state.auditLogs.length > 0 ? auditLogHTML : '<p class="text-center text-gray-500 py-4">No recent administrative changes recorded.</p>'}
                        </ul>
                    </div>
                </div>
            </div>
        `;
    } else {
         contentHTML = `
            <div class="flex flex-col items-center justify-center min-h-screen">
                <i class="fas fa-exclamation-triangle text-4xl text-red-600"></i>
                <p class="mt-4 text-xl font-semibold text-gray-700">Application Error: Unknown View or Authentication Failure.</p>
                <button onclick="navigateTo('login')" class="mt-4 py-2 px-4 bg-indigo-600 text-white rounded-lg">Go to Login</button>
            </div>
        `;
    }

    $appContainer.innerHTML = contentHTML;
}

// Inside uiRender.js, find the definitions for your modal functions, and add 'export'
export function closeLogModal() {
    document.getElementById('log-modal').classList.add('hidden');
}

export function closeSignupModal() {
    document.getElementById('employee-signup-modal').classList.add('hidden');
}

