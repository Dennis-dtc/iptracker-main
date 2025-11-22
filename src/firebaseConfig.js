import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getDatabase, ref, set, onValue, remove } from 'firebase/database';
import { getStorage } from 'firebase/storage'; // ✅ Add storage import


const firebaseConfig = {
  apiKey: "AIzaSyCNpSMB5Myw7v5UeNP5L-Qc5RzE8TYzY_8",
  authDomain: "my-react-app-test-bf2d6.firebaseapp.com",
  databaseURL: "https://my-react-app-test-bf2d6-default-rtdb.firebaseio.com/",
  projectId: "my-react-app-test-bf2d6",
  storageBucket: "my-react-app-test-bf2d6.firebasestorage.app",
  messagingSenderId: "429615572107",
  appId: "1:429615572107:web:22b8b0cfabdb28576fa08e"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const firestore = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app); // ✅ Add storage export

export { database, app, firestore, auth, storage, signInAnonymously, ref, set, onValue, remove };



// // Import the functions you need from the SDKs you need
// import { initializeApp } from "firebase/app";
// import { getAnalytics } from "firebase/analytics";
// // TODO: Add SDKs for Firebase products that you want to use
// // https://firebase.google.com/docs/web/setup#available-libraries

// // Your web app's Firebase configuration
// // For Firebase JS SDK v7.20.0 and later, measurementId is optional
// const firebaseConfig = {
//   apiKey: "AIzaSyC1qA6JojEHl1uzRKWkuPnFUx7_uqKRJJU",
//   authDomain: "mama-fua-e15c0.firebaseapp.com",
//   databaseURL: "https://mama-fua-e15c0-default-rtdb.firebaseio.com",
//   projectId: "mama-fua-e15c0",
//   storageBucket: "mama-fua-e15c0.firebasestorage.app",
//   messagingSenderId: "616060985493",
//   appId: "1:616060985493:web:97b6743bff35db56897b9c",
//   measurementId: "G-SW4DG8QEM6"
// };

// // Initialize Firebase
// const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);