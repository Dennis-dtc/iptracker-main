// src/components/ModalPanel.jsx
import React from "react";

/**
 * Simple right-side modal panel wrapper (not browser modal).
 * Renders content inside a white panel with a close button.
 */
export default function ModalPanel({ title, onClose, children }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <button
          className="text-sm text-gray-600 hover:text-gray-900"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <div>{children}</div>
    </div>
  );
}
