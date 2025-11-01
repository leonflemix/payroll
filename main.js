// Filename: main.js
import { initFirebase } from './firebase.js';

/*
|--------------------------------------------------------------------------
| APPLICATION BOOTSTRAP
|--------------------------------------------------------------------------
| This file is the entry point that runs when the HTML loads.
*/

window.onload = function() {
    // Initialize Firebase services and set up the main Auth listener
    initFirebase();
};
