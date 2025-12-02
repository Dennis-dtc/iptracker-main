// src/userSessionService.js
import { auth, firestore, database, signInAnonymously } from "../firebaseConfig";
import {
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
  deleteDoc
} from "firebase/firestore";
import { ref as dbRef, remove } from "firebase/database";

/**
 * Strict anonymous session logic:
 * - Forces new + existing anonymous users to "anonymous mode"
 * - Cleanup timer deletes them if profile is not completed
 */
export async function initUserSession(role = "customer") {
  try {
    // Firebase anonymous auth
    const userCred = await signInAnonymously(auth);
    const user = userCred.user;
    const uid = user.uid;

    const userRef = doc(firestore, "users", uid);
    const existing = await getDoc(userRef);

    // CASE 1. Existing user — force anonymous mode again
    if (existing.exists()) {
      console.log("Existing user detected, forcing anonymous mode:", uid);

      await setDoc(
        userRef,
        {
          anonymous: true,
          profileComplete: false,
          role,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      // Restart cleanup timer
      startAnonymousCleanupTimer(uid);

      return { id: uid, ...existing.data() };
    }

    // CASE 2. New anonymous user profile
    const profile = {
      uid,
      name: `Guest-${uid.slice(0, 5)}`,
      role,
      email: "",
      phone: "",
      anonymous: true,
      profileComplete: false,
      status: role === "cleaner" ? "offline" : "active",
      createdAt: serverTimestamp()
    };

    await setDoc(userRef, profile, { merge: true });

    console.log("New anonymous session created:", uid);

    startAnonymousCleanupTimer(uid);
    return { id: uid, ...profile };
  } catch (err) {
    console.error("Error in initUserSession:", err);
    throw err;
  }
}

/**
 * Auto-delete anonymous users after 2 minutes if profile is not completed.
 */
function startAnonymousCleanupTimer(uid) {
  console.log("Starting cleanup timer for:", uid);

  setTimeout(async () => {
    try {
      const userRef = doc(firestore, "users", uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) return;

      const data = snap.data();

      // If they completed profile or became real user → do NOT delete
      if (data.profileComplete === true) {
        console.log("User completed profile, keeping:", uid);
        return;
      }

      // Still anonymous + incomplete → DELETE
      console.log("Auto-deleting anonymous incomplete user:", uid);

      await deleteDoc(userRef);
      await remove(dbRef(database, `locations/${uid}`));
      auth.signOut();

    } catch (err) {
      console.error("Cleanup error:", err);
    }
  }, 2 * 60 * 1000); // 2 minutes
}

/**
 * Call when user finishes profile.
 */
export async function markProfileComplete(uid) {
  try {
    const userRef = doc(firestore, "users", uid);
    await setDoc(
      userRef,
      { profileComplete: true, anonymous: false },
      { merge: true }
    );

    console.log("Profile marked complete:", uid);
  } catch (err) {
    console.error("Error marking profile complete:", err);
  }
}
