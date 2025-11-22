// src/services/userService.js
import { firestore as db } from "../firebaseConfig";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from "firebase/firestore";

// Allowed fields for updates
const SAFE_USER_FIELDS = [
  "name",
  "email",
  "phone",
  "photoURL",
  "category"
];

/** -------------------------------
 * CREATE PROFILE
 -------------------------------- */
export async function createUserProfile({
  uid,
  name = "",
  email = "",
  phone = "",
  role = "customer",
  category = null,
  photoURL = "",
  meta = {}
}) {
  if (!uid) throw new Error("uid required");

  const userRef = doc(db, "users", uid);
  const payload = {
    uid,
    name,
    email,
    phone,
    role,
    category,
    photoURL,
    rating: 0,
    ratingCount: 0,
    status: "active",
    createdAt: serverTimestamp(),
    meta
  };

  await setDoc(userRef, payload, { merge: true });
  return payload;
}

/** -------------------------------
 * GET PROFILE
 -------------------------------- */
export async function getUserById(uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** -------------------------------
 * UPDATE PROFILE (SAFE PATCH)
 -------------------------------- */
export async function updateUser(uid, data = {}) {
  if (!uid) throw new Error("uid required");

  const userRef = doc(db, "users", uid);

  // only allow certain fields, ignore the rest
  const cleanPatch = {};
  for (const key of SAFE_USER_FIELDS) {
    if (data[key] !== undefined) {
      cleanPatch[key] = data[key];
    }
  }

  cleanPatch.updatedAt = serverTimestamp();

  await updateDoc(userRef, cleanPatch);
  return true;
}

/** ------------------------------- */
export async function getUsersByRole(role) {
  const q = query(collection(db, "users"), where("role", "==", role));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** ------------------------------- */
export async function getCleanersByCategory(category) {
  const q = query(
    collection(db, "users"),
    where("role", "==", "cleaner"),
    where("category", "==", category)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** ------------------------------- */
export async function assignCleanerToManager(managerId, cleanerId) {
  const managerRef = doc(db, "users", managerId);
  const cleanerRef = doc(db, "users", cleanerId);

  await updateDoc(managerRef, { managedCleaners: arrayUnion(cleanerId) });
  await updateDoc(cleanerRef, { managerId });

  return true;
}

/** ------------------------------- */
export async function removeCleanerFromManager(managerId, cleanerId) {
  const managerRef = doc(db, "users", managerId);
  const cleanerRef = doc(db, "users", cleanerId);

  await updateDoc(managerRef, { managedCleaners: arrayRemove(cleanerId) });
  await updateDoc(cleanerRef, { managerId: null });

  return true;
}

/** ------------------------------- */
export async function addRatingToCleaner(cleanerId, score) {
  const cleanerRef = doc(db, "users", cleanerId);
  const snap = await getDoc(cleanerRef);

  if (!snap.exists()) throw new Error("Cleaner not found");

  const data = snap.data();
  const prevAvg = data.rating || 0;
  const prevCount = data.ratingCount || 0;
  const newCount = prevCount + 1;
  const newAvg = (prevAvg * prevCount + score) / newCount;

  await updateDoc(cleanerRef, {
    rating: newAvg,
    ratingCount: newCount
  });

  return { rating: newAvg, ratingCount: newCount };
}
