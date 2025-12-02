// src/bookingService.js
import { firestore as db } from "../firebaseConfig";
import { collection, addDoc, getDocs, serverTimestamp, doc, updateDoc } from "firebase/firestore";

/**
 * Creates a new booking in Firestore
 * @param {Object} data - Booking details
 */
export async function createBooking(data) {
  try {
    // 1️⃣ Create a new booking
    const docRef = await addDoc(collection(db, "bookings"), {
      customerId: data.customerId,
      cleanerId: data.cleanerId,
      serviceType: data.serviceType,
      location: data.location,
      price: data.price,
      status: "pending",
      createdAt: serverTimestamp(),
      bookingId: "" // placeholder
    });

    // 2️⃣ Immediately update it with its own Firestore ID
    await updateDoc(docRef, { bookingId: docRef.id });

    console.log("✅ Booking created with ID:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("❌ Error creating booking:", error);
  }
}

/**
 * Fetches all bookings from Firestore
 */
export async function getAllBookings() {
  try {
    const querySnapshot = await getDocs(collection(db, "bookings"));
    const bookings = [];
    querySnapshot.forEach((doc) => {
      bookings.push({ id: doc.id, ...doc.data() });
    });
    console.log("✅ All bookings:", bookings);
    return bookings;
  } catch (error) {
    console.error("❌ Error fetching bookings:", error);
    return [];
  }
}

/**
 * Updates the status of a booking
 * @param {string} bookingId - The ID of the booking document
 * @param {string} newStatus - The new status (accepted, in-progress, completed, etc.)
 */
export async function updateBookingStatus(bookingId, newStatus) {
  try {
    const bookingRef = doc(db, "bookings", bookingId);
    await updateDoc(bookingRef, { status: newStatus });
    console.log(`✅ Booking ${bookingId} updated to status: ${newStatus}`);
  } catch (error) {
    console.error("❌ Error updating booking status:", error);
  }
}

/**
 * Simulates payment and generates a receipt for a completed booking
 * @param {string} bookingId - The ID of the completed booking
 * @param {number} amount - The total amount to be paid
 * @param {string} cleanerId - ID of the cleaner
 * @param {string} customerId - ID of the customer
 */
export async function processPayment(bookingId, amount, cleanerId, customerId) {
  try {
    // 1️⃣ Add a new payment record
    const paymentRef = await addDoc(collection(db, "payments"), {
      bookingId,
      amount,
      cleanerId,
      customerId,
      paymentStatus: "successful",
      createdAt: serverTimestamp()
    });

    // 2️⃣ Update booking to mark as paid
    const bookingRef = doc(db, "bookings", bookingId);
    await updateDoc(bookingRef, { status: "paid" });

    // 3️⃣ Generate receipt record
    const receiptRef = await addDoc(collection(db, "receipts"), {
      bookingId,
      paymentId: paymentRef.id,
      amount,
      customerId,
      cleanerId,
      generatedAt: serverTimestamp()
    });

    console.log(`✅ Payment processed & receipt created (ID: ${receiptRef.id})`);
    return receiptRef.id;
  } catch (error) {
    console.error("❌ Error processing payment:", error);
  }
}

/**
 * Mark a booking as completed
 */
export async function completeBooking(bookingId) {
  try {
    const bookingRef = doc(db, "bookings", bookingId);
    await updateDoc(bookingRef, {
      status: "completed",
      rated: false
    });
    console.log("✅ Booking marked as completed");
  } catch (error) {
    console.error("❌ Error completing booking:", error);
  }
}


// Get bookings grouped by day of the week
export async function getWeeklyBookingStats() {
  const snapshot = await getDocs(collection(db, "bookings"));

  // Initialize array for Sun–Sat
  const daily = [0, 0, 0, 0, 0, 0, 0];
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (!data.createdAt) return;
    const day = data.createdAt.toDate().getDay(); // 0–6
    daily[day] += 1;
  });

  return daily;
}

// Get earnings per day of week
export async function getWeeklyEarningsStats() {
  const snapshot = await getDocs(collection(db, "payments"));

  const earnings = [0, 0, 0, 0, 0, 0, 0];
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (!data.createdAt || !data.amount) return;

    const day = data.createdAt.toDate().getDay();
    earnings[day] += data.amount;
  });

  return earnings;
}

