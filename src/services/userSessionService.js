// src/userSessionService.js
import { auth, firestore, signInAnonymously } from "../firebaseConfig";
import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";

/**
 * Initializes a user session.
 * If not logged in, signs in anonymously.
 * Creates or updates Firestore profile accordingly (matching full profile structure).
 */
export async function initUserSession(role = "customer") {
  try {
    // Authenticate anonymously
    const userCred = await signInAnonymously(auth);
    const user = userCred.user;
    const uid = user.uid;

    const userRef = doc(firestore, "users", uid);
    const existingSnap = await getDoc(userRef);

    // If user already has a saved profile, DO NOT overwrite it.
    if (existingSnap.exists()) {
      const data = existingSnap.data();

      // Only update role if user is first time choosing one (optional)
      if (!data.role) {
        await setDoc(
          userRef,
          {
            role,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );
      }

      console.log(`🔄 Existing user session resumed: ${uid}`);
      return { id: uid, ...existingSnap.data() };
    }

    // New anonymous user: create full profile structure
    const newProfile = {
      uid,
      name: `Guest-${uid.slice(0, 5)}`,
      email: "",                // empty until user edits in Profile
      phone: "",                // empty until user edits
      role,                     // "customer" or "cleaner"
      anonymous: true,
      status: role === "cleaner" ? "offline" : "active",
      rating: 0,
      ratingCount: 0,
      photoURL: "",            // added for ProfileForm
      category: null,
      meta: {},
      createdAt: serverTimestamp()
    };

    await setDoc(userRef, newProfile, { merge: true });

    console.log(`✅ Anonymous ${role} session started: ${uid}`);
    return { id: uid, ...newProfile };
  } catch (err) {
    console.error("❌ Error initializing anonymous session:", err);
    throw err;
  }
}
