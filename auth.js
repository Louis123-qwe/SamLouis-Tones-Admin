import { auth, db } from './config.js';

export const AuthService = {
  async signup(email, password, fullName) {
    // 1. Create the user in Firebase Auth
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    
    // 2. Attach the name to the Auth Object
    await cred.user.updateProfile({
        displayName: fullName
    });

    // 3. Create the Firestore Document
    await db.collection('users').doc(cred.user.uid).set({
        uid: cred.user.uid,
        email: email,
        displayName: fullName,
        role: 'user',
        plan: 'free',
        completedLessons: [],
        points: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    return cred.user;
  },

  async login(email, password) {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    return cred.user;
  },

  async logout() {
    await auth.signOut();
    window.location.href = 'index.html';
  },

  async getProfile(uid) {
    const snap = await db.collection('users').doc(uid).get();
    return snap.exists ? snap.data() : null;
  },

  onAuthChange(callback) {
    return auth.onAuthStateChanged(callback);
  },

  requireAuth(redirectTo = 'index.html') {
    return new Promise((resolve, reject) => {
      const unsub = auth.onAuthStateChanged(user => {
        unsub();
        if (user) {
          resolve(user);
        } else { 
          window.location.href = redirectTo;
          reject(new Error('Authentication required'));
        }
      });
    });
  },

  async requireAdmin() {
    const user = await this.requireAuth(); 
    const profile = await this.getProfile(user.uid);
    if (!profile || profile.role !== 'admin') {
      window.location.href = 'index.html'; 
      throw new Error('Not an admin');
    }
    return { user, profile };
  }
};
