// src/services/adminService.js
import { firestore as db } from "../firebaseConfig";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";

/**
 * Create or update admin profile in adminAuth
 */
export async function createAdminProfile({ uid, username, password, role = "admin", meta = {} }) {
  if (!uid) throw new Error("uid required");

  const adminRef = doc(db, "adminAuth", uid);

  const payload = {
    uid,
    username,
    password,
    role,
    createdAt: serverTimestamp(),
    meta
  };

  await setDoc(adminRef, payload, { merge: true });
  return payload;
}

/**
 * Get admin profile
 */
export async function getAdminProfile(uid) {
  const snap = await getDoc(doc(db, "adminAuth", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
