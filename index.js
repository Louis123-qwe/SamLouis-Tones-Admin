// ============================================================
// FIREBASE CLOUD FUNCTIONS
// Deploy with: firebase deploy --only functions
// ============================================================

const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

// ─── REDEEM PAYMENT CODE (Secure) ────────────────────────────

exports.redeemPaymentCode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
  }

  const { code } = data;
  const userId = context.auth.uid;

  if (!code || typeof code !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "Invalid code.");
  }

  const codeQuery = await db.collection("paymentCodes")
    .where("code", "==", code.toUpperCase().trim())
    .limit(1)
    .get();

  if (codeQuery.empty) {
    throw new functions.https.HttpsError("not-found", "Code not found.");
  }

  const codeDoc = codeQuery.docs[0];
  const codeData = codeDoc.data();

  // Validate
  if (codeData.status === "used") {
    throw new functions.https.HttpsError("already-exists", "Code already used.");
  }
  if (codeData.assignedUserId && codeData.assignedUserId !== userId) {
    throw new functions.https.HttpsError("permission-denied", "Code not assigned to you.");
  }
  if (codeData.expiresAt && codeData.expiresAt.toDate() < new Date()) {
    throw new functions.https.HttpsError("deadline-exceeded", "Code has expired.");
  }

  // Run atomically
  await db.runTransaction(async (t) => {
    const userRef = db.collection("users").doc(userId);
    const codeRef = codeDoc.ref;

    t.update(codeRef, {
      status: "used",
      usedBy: userId,
      usedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    t.update(userRef, {
      plan: codeData.plan,
      planActivatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  // Send notification
  await db.collection("notifications").add({
    userId,
    title: "Subscription Activated! 🎉",
    message: `Your ${codeData.plan} plan is now active. Welcome to Music Club!`,
    type: "subscription",
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success: true, plan: codeData.plan };
});

// ─── GENERATE PAYMENT CODE (Admin Only) ──────────────────────

exports.generatePaymentCode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
  }

  // Verify admin
  const adminDoc = await db.collection("users").doc(context.auth.uid).get();
  if (!adminDoc.exists || adminDoc.data().role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Admin only.");
  }

  const { plan, assignedUserId, expiryDays } = data;

  if (!["course", "premium"].includes(plan)) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid plan type.");
  }

  // Generate unique code
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  const expiresAt = expiryDays
    ? admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)
      )
    : null;

  await db.collection("paymentCodes").add({
    code,
    plan,
    assignedUserId: assignedUserId || null,
    status: "unused",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: context.auth.uid,
    expiresAt
  });

  // Notify user if assigned
  if (assignedUserId) {
    await db.collection("notifications").add({
      userId: assignedUserId,
      title: "Payment Code Ready 🎟️",
      message: `Your activation code is: ${code}. Enter it in your dashboard to activate ${plan} plan.`,
      type: "code",
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  return { success: true, code };
});

// ─── UNLOCK MARKETPLACE ITEM (Admin Approval) ────────────────

exports.unlockMarketplaceItem = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
  }

  const adminDoc = await db.collection("users").doc(context.auth.uid).get();
  if (!adminDoc.exists || adminDoc.data().role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Admin only.");
  }

  const { userId, itemId } = data;

  await db.collection("unlockedItems").doc(`${userId}_${itemId}`).set({
    userId, itemId,
    unlockedAt: admin.firestore.FieldValue.serverTimestamp(),
    unlockedBy: context.auth.uid
  });

  return { success: true };
});

// ─── SEND NOTIFICATION (Admin) ────────────────────────────────

exports.sendNotification = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
  }

  const adminDoc = await db.collection("users").doc(context.auth.uid).get();
  if (!adminDoc.exists || adminDoc.data().role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Admin only.");
  }

  const { userId, title, message, type } = data;

  // userId === 'all' means broadcast
  if (userId === "all") {
    const users = await db.collection("users").get();
    const batch = db.batch();
    users.docs.forEach(u => {
      const ref = db.collection("notifications").doc();
      batch.set(ref, {
        userId: u.id, title, message,
        type: type || "announcement",
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    await batch.commit();
  } else {
    await db.collection("notifications").add({
      userId, title, message,
      type: type || "announcement",
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  return { success: true };
});

