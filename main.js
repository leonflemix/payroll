// Filename: main.js
import { initFirebase } from './firebase.js';

/*
|--------------------------------------------------------------------------
| 1. INITIAL EXECUTION
|--------------------------------------------------------------------------
| This file simply loads the Firebase initialization logic when the DOM is ready.
*/

document.addEventListener('DOMContentLoaded', async () => {
    // Expose utility functions globally so they can be called by HTML elements defined in index.html
    // This is handled via exports in uiRender.js but re-importing ensures the flow is correct.
    
    await initFirebase();
});
