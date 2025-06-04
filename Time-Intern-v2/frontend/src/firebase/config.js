// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from 'firebase/firestore'; // Import Firestore!
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCU2BXGlmzfFqC4n28V985ZIssoX38AS0c",
  authDomain: "timeinternv2.firebaseapp.com",
  projectId: "timeinternv2",
  storageBucket: "timeinternv2.firebasestorage.app",
  messagingSenderId: "384104249194",
  appId: "1:384104249194:web:dab94738d6b805781bd713",
  measurementId: "G-H06VVQE2KW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Get a reference to the Firestore service
const db = getFirestore(app);

// Initialize and export auth
export const auth = getAuth(app);
export default app;
// Export the db instance so you can use it in other parts of your app
export { db };