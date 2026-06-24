import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";

// Config parsed from firebase-applet-config.json
const firebaseConfig = {
  apiKey: "AIzaSyChW2VvB7g2MZQU5hwo3i1LHuvl5B8weyw",
  authDomain: "carbide-affinity-lgbcx.firebaseapp.com",
  projectId: "carbide-affinity-lgbcx",
  storageBucket: "carbide-affinity-lgbcx.firebasestorage.app",
  messagingSenderId: "128474779549",
  appId: "1:128474779549:web:fe320b6ce939bb23f8e974"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Firestore targeting our custom databaseId
export const db = getFirestore(app, "ai-studio-9ac65dd4-0cdb-4902-b111-d92523e8508f");

// Critical connection verification function as required by guidelines
export async function testFirestoreConnection() {
  try {
    // Attempt reading from a test connection path
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("[Firebase] Successfully connected and tested connection with Firestore.");
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("[Firebase] Connection test failed: Client is offline. Please check your Firebase configuration.");
    } else {
      console.log("[Firebase] Connection test triggered. (Note: database initialization will occur on first collection write).");
    }
  }
}
