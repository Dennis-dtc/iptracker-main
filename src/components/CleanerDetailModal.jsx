// src/components/CleanerDetailModal.jsx
import React from "react";

export default function CleanerDetailModal({ cleaner, onClose }) {
  if (!cleaner) return null;

  return (
    <div className="bg-white p-6 rounded-2xl shadow w-full">
      <div className="flex justify-between mb-4">
        <h2 className="text-xl font-semibold">Cleaner Details</h2>
        <button className="text-sm text-gray-600" onClick={onClose}>Close</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        <div>
          <h3 className="text-lg font-semibold mb-2">Profile</h3>
          <p><b>Name:</b> {cleaner.name}</p>
          <p><b>Email:</b> {cleaner.email}</p>
          <p><b>Phone:</b> {cleaner.phone || "N/A"}</p>
          <p><b>Category:</b> {cleaner.category || "N/A"}</p>
          <p><b>Status:</b> {cleaner.status}</p>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-2">Performance</h3>
          <p><b>Rating:</b> {cleaner.rating?.toFixed(1) ?? 0}/5</p>
          <p><b>Total Ratings:</b> {cleaner.ratingCount ?? 0}</p>
          <p><b>Total Earnings:</b> ${cleaner.totalEarnings ?? 0}</p>
        </div>

      </div>
    </div>
  );
}
