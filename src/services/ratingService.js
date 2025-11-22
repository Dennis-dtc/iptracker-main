// src/ratingService.js
import { firestore as db } from "../firebaseConfig";
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  query,
  where,
  serverTimestamp,
  doc,
  updateDoc
} from "firebase/firestore";

/**
 * Add a customer rating for a cleaner (only if booking is completed)
 */
export async function addRating({ cleanerId, customerId, bookingId, rating, comment }) {
  try {
    // ✅ Check if the booking exists and is completed
    const bookingRef = doc(db, "bookings", bookingId);
    const bookingSnap = await getDoc(bookingRef);

    if (!bookingSnap.exists()) {
      console.warn("⚠️ Booking not found — cannot add rating.");
      return;
    }

    const bookingData = bookingSnap.data();
    if (bookingData.status !== "completed") {
      console.warn("⚠️ Booking not completed — cannot add rating yet.");
      return;
    }

    // ✅ Add the rating to Firestore
    const docRef = await addDoc(collection(db, "ratings"), {
      cleanerId,
      customerId,
      bookingId,
      rating,
      comment,
      createdAt: serverTimestamp()
    });
    console.log("✅ Rating added with ID:", docRef.id);

    // ✅ Mark the booking as rated
    await updateDoc(bookingRef, { rated: true });
    console.log("✅ Booking marked as rated");

    // ✅ Update cleaner's rating info (only if user is cleaner)
    const cleanerRef = doc(db, "users", cleanerId);
    const cleanerSnap = await getDoc(cleanerRef);

    if (cleanerSnap.exists() && cleanerSnap.data().role === "cleaner") {
      const q = query(collection(db, "ratings"), where("cleanerId", "==", cleanerId));
      const querySnapshot = await getDocs(q);

      let total = 0;
      let count = 0;
      querySnapshot.forEach((doc) => {
        total += doc.data().rating;
        count++;
      });

      const newAverage = count > 0 ? total / count : 0;
      await updateDoc(cleanerRef, {
        rating: newAverage,
        ratingCount: count
      });

      console.log(`⭐ Updated cleaner ${cleanerId} rating: ${newAverage.toFixed(1)} (${count} ratings)`);
    }

  } catch (error) {
    console.error("❌ Error adding rating:", error);
  }
}


/**
 * Get all ratings for a specific cleaner
 */
export async function getCleanerRatings(cleanerId) {
  try {
    const q = query(collection(db, "ratings"), where("cleanerId", "==", cleanerId));
    const querySnapshot = await getDocs(q);
    const ratings = [];
    querySnapshot.forEach((doc) => ratings.push({ id: doc.id, ...doc.data() }));
    console.log("✅ Ratings for cleaner:", ratings);
    return ratings;
  } catch (error) {
    console.error("❌ Error fetching cleaner ratings:", error);
    return [];
  }
}


/**
 * Get average rating for a cleaner
 */
export async function getAverageRating(cleanerId) {
  try {
    const q = query(collection(db, "ratings"), where("cleanerId", "==", cleanerId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.log("ℹ️ No ratings found for cleaner");
      return 0;
    }

    let total = 0;
    let count = 0;

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      total += data.rating;
      count++;
    });

    const average = total / count;
    console.log(`⭐ Average rating for cleaner ${cleanerId}:`, average.toFixed(2));
    return average;
  } catch (error) {
    console.error("❌ Error calculating average rating:", error);
    return 0;
  }
}


/**
 * Calculates the average rating for a specific cleaner
 * @param {string} cleanerId
 */
export async function getAverageRatingForCleaner(cleanerId) {
  try {
    const q = query(collection(db, "ratings"), where("cleanerId", "==", cleanerId));
    const querySnapshot = await getDocs(q);

    let total = 0;
    let count = 0;

    querySnapshot.forEach((doc) => {
      total += doc.data().rating;
      count++;
    });

    const average = count > 0 ? total / count : 0;
    console.log(`⭐ Average rating for ${cleanerId}: ${average.toFixed(1)} (${count} ratings)`);

    return average;
  } catch (error) {
    console.error("❌ Error calculating average rating:", error);
    return 0;
  }
}
