// Firebase Configuration
// Replace these with your actual Firebase project credentials
const firebaseConfig = {
  apiKey: "AIzaSyA2vFmLxiONdEgwswzkoSv_eto1C55A0iY",
  authDomain: "zeroone-16e62.firebaseapp.com",
  projectId: "zeroone-16e62",
  storageBucket: "zeroone-16e62.firebasestorage.app",
  messagingSenderId: "166539664312",
  appId: "1:166539664312:web:9c582ff6886b9cb35bcd4d",
  databaseURL: "https://zeroone-16e62-default-rtdb.firebaseio.com/"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const rtdb = firebase.database();
// NOTE: Firebase Storage requires Blaze plan.
// This app uses Firestore base64 storage instead (free tier compatible).
const storage = null;

// Auth state observer
auth.onAuthStateChanged((user) => {
  if (user) {
    window._currentUser = user;
  } else {
    window._currentUser = null;
  }
});
