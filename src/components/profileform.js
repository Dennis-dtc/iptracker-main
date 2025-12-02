// src/components/ProfileForm.js
import React, { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  Typography,
  Stack,
  Box,
  TextField,
  Button,
  Rating,
  Divider
} from "@mui/material";

import {
  getUserById,
  updateUser,
  createUserProfile
} from "../services/userService";

import { getAverageRatingForCleaner } from "../services/ratingService";
import { markProfileComplete } from "../services/userSessionService";

import { database } from "../firebaseConfig";
import { ref as rtdbRef, get as rtdbGet, update as rtdbUpdate } from "firebase/database";

export default function ProfileForm({ user }) {
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [avgRating, setAvgRating] = useState(0);
  const [saving, setSaving] = useState(false);
  const [roleFromRTDB, setRoleFromRTDB] = useState("customer");

  useEffect(() => {
    if (user?.uid) loadProfileFromSession(user.uid);
  }, [user?.uid]);

  // 1. Load profile: Firestore preferred, fallback to RTDB
  const loadProfileFromSession = async (uid) => {
    let firestoreData = await getUserById(uid);
    let rtdbData = {};

    try {
      const snap = await rtdbGet(rtdbRef(database, `locations`));
      rtdbData = snap.val() || {};
    } catch (err) {
      console.warn("RTDB fetch error:", err);
    }

    // Try to find user in RTDB
    let rtdbUser = null;
    for (const key in rtdbData) {
      if (rtdbData[key].uid === uid) {
        rtdbUser = rtdbData[key];
        break;
      }
    }

    const role = rtdbUser?.role || "customer";
    setRoleFromRTDB(role);

    // Build profile
    let data = firestoreData || {
      uid,
      name: rtdbUser?.name || `Guest-${uid.slice(0, 6)}`,
      email: rtdbUser?.email || "",
      phone: rtdbUser?.phone || "",
      role,
      rating: 0,
      ratingCount: 0,
      photoURL: "",
      profileComplete: false
    };

    // Ensure Firestore has record
    if (!firestoreData) await createUserProfile(data);

    setProfile(data);

    // For cleaners, load avg rating
    if (role === "cleaner") {
      const ratingValue = await getAverageRatingForCleaner(uid);
      setAvgRating(ratingValue);
    } else {
      setAvgRating(0);
    }
  };

  const handleChange = (e) => {
    setProfile((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // 2. Save profile & sync RTDB
  const saveProfile = async () => {
    if (!profile) return;
    setSaving(true);

    try {
      profile.role = roleFromRTDB; // enforce role

      // Update Firestore
      await updateUser(profile.uid, profile);

      // Mark complete
      await markProfileComplete(profile.uid);

      // Update RTDB where applicable
      try {
        const snap = await rtdbGet(rtdbRef(database, `locations`));
        const rtdbData = snap.val() || {};
        for (const key in rtdbData) {
          if (rtdbData[key].uid === profile.uid) {
            await rtdbUpdate(rtdbRef(database, `locations/${key}`), {
              name: profile.name,
              email: profile.email,
              phone: profile.phone
            });
            break;
          }
        }
      } catch (err) {
        console.warn("RTDB update error:", err);
      }

      // Reload latest profile
      await loadProfileFromSession(profile.uid);

      setEditing(false);
    } catch (err) {
      console.error("Save error:", err);
      alert("Could not save profile.");
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return (
      <Card sx={{ maxWidth: 500, margin: "2rem auto", p: 2 }}>
        <CardContent>
          <Typography>Loading profile…</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ maxWidth: 500, margin: "2rem auto", p: 2 }}>
      <CardContent>
        <Stack spacing={2} alignItems="center">
          <Typography variant="h5">{profile.name || "-"}</Typography>
          <Typography color="text.secondary">
            Role: {roleFromRTDB || "-"}
          </Typography>

          {/* Rating only for cleaners */}
          {roleFromRTDB === "cleaner" && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Rating value={Number(avgRating) || 0} precision={0.5} readOnly />
              <Typography variant="body2">
                ({avgRating ? Number(avgRating).toFixed(1) : "0.0"})
              </Typography>
            </Box>
          )}

          <Divider sx={{ width: "100%", my: 1 }} />

          {!editing && (
            <>
              <Typography variant="subtitle2">Email</Typography>
              <Typography>{profile.email || "-"}</Typography>

              <Typography variant="subtitle2">Phone</Typography>
              <Typography>{profile.phone || "-"}</Typography>

              <Button
                variant="contained"
                sx={{ mt: 2 }}
                onClick={() => setEditing(true)}
              >
                Edit Profile
              </Button>
            </>
          )}

          {editing && (
            <Stack spacing={2} sx={{ width: "100%" }}>
              <TextField
                label="Name"
                name="name"
                value={profile.name}
                onChange={handleChange}
              />

              <TextField
                label="Email"
                name="email"
                value={profile.email}
                onChange={handleChange}
              />

              <TextField
                label="Phone"
                name="phone"
                value={profile.phone}
                onChange={handleChange}
              />

              <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
                <Button
                  variant="outlined"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>

                <Button
                  variant="contained"
                  onClick={saveProfile}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              </Box>
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
