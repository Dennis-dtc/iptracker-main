// src/auth/LandingAuth.js
import React from "react";
import { useNavigate } from "react-router-dom";

export default function LandingAuth() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white shadow-lg p-6 rounded w-full max-w-sm text-center">
        <h2 className="text-xl font-semibold mb-4">Welcome</h2>
        <p className="text-gray-600 mb-6">
          Choose how you want to continue.
        </p>

        <button
          onClick={() => navigate("/app")}
          className="w-full py-2 bg-blue-600 text-white rounded mb-3"
        >
          Proceed (Customer / Cleaner)
        </button>

        <button
          onClick={() => navigate("/admin-login")}
          className="w-full py-2 bg-orange-600 text-white rounded"
        >
          Admin Login
        </button>
      </div>
    </div>
  );
}
