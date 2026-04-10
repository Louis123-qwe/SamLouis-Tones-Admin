// ============================================================
// DATABASE SERVICE — All Firestore operations
// ============================================================
import { db, functions } from './config.js';

const FS = firebase.firestore;

// ─── USERS ──────────────────────────────────────────────────

export const UserService = {
  /**
   * Fetches a single user profile by UID
   */
  async get(uid) {
    try {
      const snap = await db.collection('users').doc(uid).get();
      return snap.exists ? { id: snap.id, ...snap.data() } : null;
    } catch (error) {
      console.error("Error fetching user:", error);
      return null;
    }
  },

  /**
   * Updates or Creates a user profile.
   * Using .set(data, { merge: true }) is critical because it will 
   * create the document if it doesn't exist (Signup) or only update
   * the changed fields if it does (Profile update).
   */
  async update(uid, data) {
    try {
      return await db.collection('users').doc(uid).set(data, { merge: true });
    } catch (error) {
      console.error("Error saving user data:", error);
      throw error;
    }
  },

  /**
   * Admin function to fetch all users
   */
  async getAll() {
    try {
      const snap = await db.collection('users').get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
      console.error("Error fetching all users:", error);
      return [];
    }
  },

  /**
   * Real-time listener for the user's profile.
   * Keeps the dashboard UI in sync with the database.
   */
  watch(uid, callback) {
    return db.collection('users').doc(uid).onSnapshot(snap => {
      const data = snap.exists ? { id: snap.id, ...snap.data() } : null;
      callback(data);
    }, error => {
      console.error("User watcher error:", error);
    });
  }
};

// ─── COURSES ────────────────────────────────────────────────

// ─── COURSES ────────────────────────────────────────────────

export const CourseService = {
  /**
   * Fetches a single course by ID.
   * Includes a guard to prevent Firebase crashes on null IDs.
   */
  async get(id) {
    if (!id || typeof id !== 'string') {
      console.warn("CourseService.get: No valid ID provided.");
      return null;
    }
    try {
      const snap = await db.collection('courses').doc(id).get();
      return snap.exists ? { id: snap.id, ...snap.data() } : null;
    } catch (error) {
      console.error("Error fetching course:", error);
      return null;
    }
  },

  /**
   * Fetches all courses ordered by their custom order field
   */
  async getAll() {
    try {
      const snap = await db.collection('courses').orderBy('order').get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
      console.error("Error fetching all courses:", error);
      return [];
    }
  },

  /**
   * Admin: Creates a new course
   */
  async create(data) {
    try {
      return await db.collection('courses').add({
        ...data,
        createdAt: FS.FieldValue.serverTimestamp(),
        lessonCount: 0,
        order: data.order || 0,
        published: data.published || false
      });
    } catch (error) {
      console.error("Error creating course:", error);
      throw error;
    }
  },

  /**
   * Admin: Updates course details
   */
  async update(id, data) {
    if (!id) throw new Error("Course ID required for update.");
    try {
      return await db.collection('courses').doc(id).update({
        ...data,
        updatedAt: FS.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error("Error updating course:", error);
      throw error;
    }
  },

  /**
   * Admin: Deletes a course
   * Note: You should also delete associated lessons in your production logic
   */
  async delete(id) {
    if (!id) return;
    try {
      return await db.collection('courses').doc(id).delete();
    } catch (error) {
      console.error("Error deleting course:", error);
      throw error;
    }
  },

  /**
   * Helper: Get course and its lessons in one go
   */
  async getWithLessons(id) {
    const course = await this.get(id);
    if (!course) return null;
    
    const lessons = await LessonService.getByCourse(id);
    return { ...course, lessons };
  }
};


// ─── LESSONS ────────────────────────────────────────────────

export const LessonService = {
  async create(courseId, data) {
    const ref = await db.collection('lessons').add({
      ...data,
      courseId,
      createdAt: FS.FieldValue.serverTimestamp(),
      order: data.order || 0
    });
    // Increment course lesson count
    await db.collection('courses').doc(courseId).update({
      lessonCount: FS.FieldValue.increment(1)
    });
    return ref;
  },
  async update(id, data) {
    return db.collection('lessons').doc(id).update(data);
  },
  async delete(id, courseId) {
    await db.collection('lessons').doc(id).delete();
    if (courseId) {
      await db.collection('courses').doc(courseId).update({
        lessonCount: FS.FieldValue.increment(-1)
      });
    }
  },
  async getByCourse(courseId) {
    const snap = await db.collection('lessons')
      .where('courseId', '==', courseId)
      .orderBy('order')
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async get(id) {
    const snap = await db.collection('lessons').doc(id).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  }
};

// ─── CONTENT BLOCKS ─────────────────────────────────────────

export const ContentBlockService = {
  async create(lessonId, data) {
    return db.collection('contentBlocks').add({
      ...data,
      lessonId,
      createdAt: FS.FieldValue.serverTimestamp(),
      position: data.position || 0,
      lock: data.lock || 'free' // free | course | premium
    });
  },
  async update(id, data) {
    return db.collection('contentBlocks').doc(id).update(data);
  },
  async delete(id) {
    return db.collection('contentBlocks').doc(id).delete();
  },
  async getByLesson(lessonId) {
    const snap = await db.collection('contentBlocks')
      .where('lessonId', '==', lessonId)
      .orderBy('position')
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async reorder(blocks) {
    // blocks: [{id, position}]
    const batch = db.batch();
    blocks.forEach(({ id, position }) => {
      batch.update(db.collection('contentBlocks').doc(id), { position });
    });
    return batch.commit();
  }
};

// ─── PAYMENT CODES ──────────────────────────────────────────

export const PaymentCodeService = {
  async create(data) {
    return db.collection('paymentCodes').add({
      code: data.code,
      plan: data.plan,         // course | premium
      assignedUserId: data.assignedUserId || null,
      status: 'unused',        // unused | used
      createdAt: FS.FieldValue.serverTimestamp(),
      expiresAt: data.expiresAt || null,
      createdBy: data.createdBy
    });
  },
  async getAll() {
    const snap = await db.collection('paymentCodes').orderBy('createdAt', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async getByCode(code) {
    const snap = await db.collection('paymentCodes').where('code', '==', code).limit(1).get();
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  },
  // Validate + redeem via Cloud Function (secure)
  async redeem(code, userId) {
    const fn = functions.httpsCallable('redeemPaymentCode');
    return fn({ code, userId });
  }
};

// ─── NOTIFICATIONS ──────────────────────────────────────────

export const NotificationService = {
  async send(userId, data) {
    return db.collection('notifications').add({
      userId,
      ...data,
      read: false,
      createdAt: FS.FieldValue.serverTimestamp()
    });
  },
  async getForUser(userId) {
    const snap = await db.collection('notifications')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async markRead(id) {
    return db.collection('notifications').doc(id).update({ read: true });
  }
};

// ─── PROGRESS ───────────────────────────────────────────────

export const ProgressService = {
  async markComplete(userId, lessonId, courseId) {
    const ref = db.collection('progress').doc(`${userId}_${lessonId}`);
    await ref.set({
      userId, lessonId, courseId,
      completedAt: FS.FieldValue.serverTimestamp()
    }, { merge: true });
    // Also update user's completedLessons array
    await db.collection('users').doc(userId).update({
      completedLessons: FS.FieldValue.arrayUnion(lessonId)
    });
  },
  async getUserProgress(userId) {
    const snap = await db.collection('progress').where('userId', '==', userId).get();
    return snap.docs.map(d => d.data());
  },
  async isComplete(userId, lessonId) {
    const snap = await db.collection('progress').doc(`${userId}_${lessonId}`).get();
    return snap.exists;
  }
};

// ─── LEADERBOARD ────────────────────────────────────────────

export const LeaderboardService = {
  async updateScore(userId, displayName, points) {
    return db.collection('leaderboard').doc(userId).set({
      userId, displayName, points,
      updatedAt: FS.FieldValue.serverTimestamp()
    }, { merge: true });
  },
  async addPoints(userId, displayName, delta) {
    const ref = db.collection('leaderboard').doc(userId);
    const snap = await ref.get();
    const current = snap.exists ? (snap.data().points || 0) : 0;
    return ref.set({
      userId, displayName,
      points: current + delta,
      updatedAt: FS.FieldValue.serverTimestamp()
    }, { merge: true });
  },
  async getTop(limit = 20) {
    const snap = await db.collection('leaderboard')
      .orderBy('points', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((d, i) => ({ rank: i + 1, id: d.id, ...d.data() }));
  }
};

// ─── QUIZ / TESTS ────────────────────────────────────────────

export const QuizService = {
  async submitScore(userId, lessonId, score, total) {
    return db.collection('quizScores').doc(`${userId}_${lessonId}`).set({
      userId, lessonId, score, total,
      percentage: Math.round((score / total) * 100),
      submittedAt: FS.FieldValue.serverTimestamp()
    }, { merge: true });
  },
  async getUserScores(userId) {
    const snap = await db.collection('quizScores').where('userId', '==', userId).get();
    return snap.docs.map(d => d.data());
  }
};

// ─── MARKETPLACE ─────────────────────────────────────────────

export const MarketplaceService = {
  async create(data) {
    return db.collection('marketplace').add({
      ...data,
      createdAt: FS.FieldValue.serverTimestamp()
    });
  },
  async getAll() {
    const snap = await db.collection('marketplace').orderBy('createdAt', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async update(id, data) {
    return db.collection('marketplace').doc(id).update(data);
  },
  async delete(id) {
    return db.collection('marketplace').doc(id).delete();
  },
  async getUserUnlocked(userId) {
    const snap = await db.collection('unlockedItems')
      .where('userId', '==', userId).get();
    return snap.docs.map(d => d.data().itemId);
  },
  async unlock(userId, itemId) {
    return db.collection('unlockedItems').doc(`${userId}_${itemId}`).set({
      userId, itemId, unlockedAt: FS.FieldValue.serverTimestamp()
    });
  }
};
