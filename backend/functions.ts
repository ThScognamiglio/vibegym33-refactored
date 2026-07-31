// NOTE: This is the source code for the Cloud Functions. 
// It requires the firebase-functions and firebase-admin packages.

/*
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

export const onLogWritten = functions.firestore
  .document("/users/{userId}/logs/{logId}")
  .onWrite(async (change, context) => {
    const userId = context.params.userId;
    const logData = change.after.exists ? change.after.data() : change.before.data();
    
    if (!logData) return null; // Deleted
    
    const exerciseId = logData.exerciseId;
    
    // Recalculate Aggregates
    // Note: In a high-scale app, we might use Distributed Counters or incrementing,
    // but for this gym app, reading a user's logs for one exercise is acceptable.
    
    const logsSnapshot = await db
      .collection(`users/${userId}/logs`)
      .where("exerciseId", "==", exerciseId)
      .where("completed", "==", true)
      .get();

    let totalReps = 0;
    let totalWeight = 0;
    let maxWeight = 0;
    let sessionDates = new Set();
    const count = logsSnapshot.size;

    logsSnapshot.forEach((doc) => {
      const data = doc.data();
      totalReps += (data.reps || 0);
      totalWeight += (data.weight || 0); // Sum of weight lifted per set
      if (data.weight > maxWeight) maxWeight = data.weight;
      if (data.date) sessionDates.add(data.date.split('T')[0]);
    });

    const summaryRef = db
      .collection(`clientExerciseSummaries/${userId}/exercises`)
      .doc(exerciseId);

    return summaryRef.set({
      totalSessions: sessionDates.size,
      totalReps: totalReps,
      avgWeight: count > 0 ? totalWeight / count : 0,
      pr: maxWeight,
      lastUpdated: new Date().toISOString()
    }, { merge: true });
  });

*/