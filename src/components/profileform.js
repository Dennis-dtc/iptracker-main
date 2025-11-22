// src/components/ProfileForm.js
import React, { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  Typography,
  Avatar,
  Stack,
  Box,
  TextField,
  Button,
  Rating,
  Divider
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Close";
import PhotoCamera from "@mui/icons-material/PhotoCamera";

import { getUserById, updateUser, createUserProfile } from "../services/userService";
import { getAverageRatingForCleaner } from "../services/ratingService";

import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebaseConfig";

export default function ProfileForm({ user, onClose }) {
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [previewURL, setPreviewURL] = useState("");
  const [avgRating, setAvgRating] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.uid) loadProfile(user.uid);
  }, [user?.uid]);

  const loadProfile = async (uid) => {
    let data = await getUserById(uid);

    if (!data) {
      data = {
        uid,
        name: user.displayName || `Guest-${uid.slice(0,6)}`,
        email: user.email || "",
        phone: "",
        role: "customer",
        rating: 0,
        ratingCount: 0,
        photoURL: ""
      };
      await createUserProfile(data);
    }

    setProfile(data);
    setPreviewURL(data.photoURL || "");

    if (data.role === "cleaner") {
      const ratingValue = await getAverageRatingForCleaner(uid);
      setAvgRating(ratingValue);
    } else {
      setAvgRating(0);
    }
  };

  const handleChange = (e) => {
    setProfile((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setPreviewURL(URL.createObjectURL(file));
  };

  const saveProfile = async () => {
    if (!profile) return;
    setSaving(true);

    try {
      if (imageFile) {
        const key = `profileImages/${profile.uid}_${Date.now()}`;
        const sRef = storageRef(storage, key);
        await uploadBytes(sRef, imageFile);
        const url = await getDownloadURL(sRef);
        profile.photoURL = url;
      }

      await updateUser(profile.uid, profile);
      await loadProfile(profile.uid);

      setEditing(false);
      setImageFile(null);
    } catch (err) {
      console.error(err);
      alert("Failed to save profile. See console for details.");
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
          {/* Avatar & Name */}
          <Avatar src={previewURL} sx={{ width: 100, height: 100 }} />
          <Typography variant="h5">{profile.name || "-"}</Typography>
          <Typography color="text.secondary">{profile.role}</Typography>

          {/* Rating if cleaner */}
          {profile.role === "cleaner" && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Rating value={Number(avgRating) || 0} precision={0.5} readOnly />
              <Typography variant="body2">({avgRating ? Number(avgRating).toFixed(1) : "0.0"})</Typography>
            </Box>
          )}

          <Divider sx={{ width: "100%", my: 1 }} />

          {/* Display mode */}
          {!editing && (
            <>
              <Typography variant="subtitle2">Email</Typography>
              <Typography>{profile.email || "-"}</Typography>

              <Typography variant="subtitle2">Phone</Typography>
              <Typography>{profile.phone || "-"}</Typography>

              <Button
                variant="contained"
                startIcon={<EditIcon />}
                sx={{ mt: 2 }}
                onClick={() => setEditing(true)}
              >
                Edit Profile
              </Button>
            </>
          )}

          {/* Edit mode */}
          {editing && (
            <Stack spacing={2} sx={{ width: "100%" }}>
              <TextField
                label="Name"
                name="name"
                value={profile.name}
                onChange={handleChange}
                fullWidth
              />
              <TextField
                label="Email"
                name="email"
                value={profile.email}
                onChange={handleChange}
                fullWidth
              />
              <TextField
                label="Phone"
                name="phone"
                value={profile.phone}
                onChange={handleChange}
                fullWidth
              />

              <Button
                variant="contained"
                component="label"
                startIcon={<PhotoCamera />}
              >
                Upload Photo
                <input hidden accept="image/*" type="file" onChange={handleImageChange} />
              </Button>
              {imageFile && <Typography variant="body2">{imageFile.name}</Typography>}

              <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
                <Button
                  variant="outlined"
                  startIcon={<CancelIcon />}
                  onClick={() => {
                    setEditing(false);
                    setImageFile(null);
                    setPreviewURL(profile.photoURL || "");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  startIcon={<SaveIcon />}
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
