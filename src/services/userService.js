// src/userService.js
// User management helpers for Firestore (works with Firebase Auth UIDs)
import { firestore as db } from "./firebaseConfig";
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

/**
 * createUserProfile
 * - Use Firebase Auth UID as the document id (recommended).
 * - If profile exists, this will merge new fields (safe for frontend-added fields).
 */
export async function createUserProfile({
  uid,
  name = "",
  email = "",
  phone = "",
  role = "customer", // customer | cleaner | manager | admin
  category = null,   // for cleaners: e.g. "house", "car", ...
  meta = {}
}) {
  if (!uid) throw new Error("uid is required (use Firebase Auth uid).");
  const userRef = doc(db, "users", uid);
  const payload = {
    uid,
    name,
    email,
    phone,
    role,
    category,
    rating: 0,
    ratingCount: 0,
    status: "active", // active | busy | inactive
    createdAt: serverTimestamp(),
    meta
  };
  await setDoc(userRef, payload, { merge: true }); // merge: true prevents overwriting unknown fields
  return { id: uid, ...payload };
}

/**
 * getUserById
 */
export async function getUserById(uid) {
  if (!uid) return null;
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * updateUser
 * - Accepts partial data object to update
 */
export async function updateUser(uid, data = {}) {
  if (!uid) throw new Error("uid is required");
  const userRef = doc(db, "users", uid);
  await updateDoc(userRef, { ...data, updatedAt: serverTimestamp() });
  return true;
}

/**
 * setUserRole
 */
export async function setUserRole(uid, role) {
  if (!uid) throw new Error("uid is required");
  await updateUser(uid, { role });
}

/**
 * getUsersByRole
 * - e.g. getUsersByRole('cleaner')
 */
export async function getUsersByRole(role) {
  const q = query(collection(db, "users"), where("role", "==", role));
  const snap = await getDocs(q);
  const arr = [];
  snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
  return arr;
}

/**
 * getCleanersByCategory
 * - e.g. category = "house"
 */
export async function getCleanersByCategory(category) {
  const q = query(
    collection(db, "users"),
    where("role", "==", "cleaner"),
    where("category", "==", category)
  );
  const snap = await getDocs(q);
  const arr = [];
  snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
  return arr;
}

/**
 * assignCleanerToManager
 * - Adds a cleaner id to manager.managedCleaners (array) and sets cleaner.managerId
 */
export async function assignCleanerToManager(managerId, cleanerId) {
  if (!managerId || !cleanerId) throw new Error("managerId and cleanerId required");
  const managerRef = doc(db, "users", managerId);
  const cleanerRef = doc(db, "users", cleanerId);
  await updateDoc(managerRef, { managedCleaners: arrayUnion(cleanerId) });
  await updateDoc(cleanerRef, { managerId });
  return true;
}

/**
 * removeCleanerFromManager
 */
export async function removeCleanerFromManager(managerId, cleanerId) {
  const managerRef = doc(db, "users", managerId);
  const cleanerRef = doc(db, "users", cleanerId);
  await updateDoc(managerRef, { managedCleaners: arrayRemove(cleanerId) });
  await updateDoc(cleanerRef, { managerId: null });
  return true;
}

/**
 * addRatingToCleaner
 * - Updates cleaner.rating (running average) and ratingCount
 */
export async function addRatingToCleaner(cleanerId, score) {
  if (!cleanerId) throw new Error("cleanerId required");
  const cleanerRef = doc(db, "users", cleanerId);
  const snap = await getDoc(cleanerRef);
  if (!snap.exists()) throw new Error("Cleaner not found");
  const data = snap.data();
  const prevAvg = data.rating || 0;
  const prevCount = data.ratingCount || 0;
  const newCount = prevCount + 1;
  const newAvg = (prevAvg * prevCount + score) / newCount;
  await updateDoc(cleanerRef, { rating: newAvg, ratingCount: newCount });
  return { rating: newAvg, ratingCount: newCount };
}
