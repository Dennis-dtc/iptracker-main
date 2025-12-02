import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, firestore } from "../firebaseConfig";
import { signInAnonymously } from "firebase/auth";
import { setDoc, doc, getDoc } from "firebase/firestore";
import { createAdminProfile, getAdminProfile } from "../services/adminService";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    try {
      const uid = "superAdmin"; // fixed UID for your admin
      let profile = await getAdminProfile(uid);

      // Create superAdmin if missing
      if (!profile) {
        await createAdminProfile({ uid, username: "superadmin", password: "super123456" });
        alert("SuperAdmin profile created! Please log in again.");
        return;
      }

      // Validate credentials
      if (username !== profile.username || password !== profile.password) {
        alert("Incorrect username or password");
        return;
      }

      // Anonymous login just for session tracking
      const userCredential = await signInAnonymously(auth);
      const sessionUid = userCredential.user.uid;

      // Create session in adminSessions
      await setDoc(doc(firestore, "adminSessions", sessionUid), {
        uid: sessionUid,
        isAdmin: true,
        loggedInAt: new Date()
      });

      localStorage.setItem("isAdmin", "true");

      navigate("/admin_dashboard");

    } catch (err) {
      console.error("Admin login error:", err);
      alert("Login failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-200">
      <div className="bg-white p-6 shadow-lg rounded w-full max-w-sm">
        <h2 className="text-xl font-bold mb-4">Admin Login</h2>

        <input
          className="w-full border p-2 rounded mb-3"
          placeholder="Admin Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <input
          className="w-full border p-2 rounded mb-3"
          type="password"
          placeholder="Admin Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          className="w-full py-2 bg-orange-600 text-white rounded"
          onClick={handleLogin}
        >
          Login
        </button>
      </div>
    </div>
  );
}
