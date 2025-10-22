import { ref, update } from "firebase/database";
import { database } from "../firebaseConfig";

// ✅ Update cleaner availability in realtime DB
export const setCleanerAvailability = async (deviceId, isAvailable) => {
  try {
    const cleanerRef = ref(database, `locations/${deviceId}`);
    await update(cleanerRef, { isAvailable });
    console.log(`Cleaner ${deviceId} availability set to: ${isAvailable}`);
  } catch (error) {
    console.error("Error updating cleaner availability:", error);
  }
};
