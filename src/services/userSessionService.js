// src/userSessionService.js
import { auth, firestore, signInAnonymously } from "../firebaseConfig";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

/**
 * Initializes a user session.
 * If not logged in, signs in anonymously.
 * Creates or updates Firestore profile accordingly.
 */
export async function initUserSession(role = "customer") {
  try {
    // Sign in anonymously
    const userCred = await signInAnonymously(auth);
    const user = userCred.user;

    const userRef = doc(firestore, "users", user.uid);
    const userData = {
      uid: user.uid,
      name: `Guest-${user.uid.slice(0, 5)}`,
      role, // 'customer' or 'cleaner'
      anonymous: true,
      status: role === "cleaner" ? "offline" : "active",
      rating: 0,
      ratingCount: 0,
      createdAt: serverTimestamp()
    };

    await setDoc(userRef, userData, { merge: true });

    console.log(`✅ Anonymous ${role} session started: ${user.uid}`);
    return userData;
  } catch (err) {
    console.error("❌ Error initializing anonymous session:", err);
    throw err;
  }
}
