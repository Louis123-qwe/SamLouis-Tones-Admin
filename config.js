// config.js
const firebaseConfig = {
  apiKey: "AIzaSyDMnFutGLBSif9FistkvueD4bE05PoLFJ0",
  authDomain: "ludek-musical-club.firebaseapp.com",
  projectId: "ludek-musical-club",
  storageBucket: "ludek-musical-club.firebasestorage.app",
  messagingSenderId: "748747368671",
  appId: "1:748747368671:web:0de68e1570b8f1d31b216a",
  measurementId: "G-XWFSVRGCKW"
};

// Initialize
if (!window.firebase.apps.length) {
    window.firebase.initializeApp(firebaseConfig);
}

// EXPORT WITH SAFETY CHECK
export const auth = window.firebase.auth();
export const fb = window.firebase;

// Use a proxy or a check to prevent "is not a function"
export const db = (function() {
    if (typeof window.firebase.firestore !== 'function') {
        console.error("Firestore script not found! Check index.html script tags.");
        return null;
    }
    return window.firebase.firestore();
})();

export const functions = window.firebase.functions ? window.firebase.functions() : null;

export const ADMIN_WHATSAPP = "2348125068082"; // Replace with your actual WhatsApp number