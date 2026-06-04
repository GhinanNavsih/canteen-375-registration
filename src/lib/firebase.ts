import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyD6kQeCJTtaapJ_LxWshG_G8DjErSugpXU",
  authDomain: "point-of-sales-app-25e2b.firebaseapp.com",
  databaseURL: "https://point-of-sales-app-25e2b-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "point-of-sales-app-25e2b",
  storageBucket: "point-of-sales-app-25e2b.appspot.com",
  messagingSenderId: "932379156472",
  appId: "1:932379156472:web:c8182745e1a48555c00d"
};

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app);
const auth = getAuth(app);
const storage = getStorage(app);

import { collection as fsCollection, doc as fsDoc, CollectionReference, DocumentReference, DocumentData } from "firebase/firestore";

export const collection = (instanceOrRef: any, path: string, ...pathSegments: string[]): CollectionReference<DocumentData> => {
  let finalPath = path;
  if (typeof window !== "undefined" && localStorage.getItem("zTestingMode") === "true") {
    if (instanceOrRef === db) {
      const parts = finalPath.split('/');
      if (!parts[0].startsWith('zTesting_')) {
        parts[0] = `zTesting_${parts[0]}`;
        finalPath = parts.join('/');
      }
    }
  }
  return fsCollection(instanceOrRef, finalPath, ...pathSegments);
};

export const doc = (instanceOrRef: any, path: string, ...pathSegments: string[]): DocumentReference<DocumentData> => {
  let finalPath = path;
  if (typeof window !== "undefined" && localStorage.getItem("zTestingMode") === "true") {
    if (instanceOrRef === db) {
      const parts = finalPath.split('/');
      if (!parts[0].startsWith('zTesting_')) {
        parts[0] = `zTesting_${parts[0]}`;
        finalPath = parts.join('/');
      }
    }
  }
  return fsDoc(instanceOrRef, finalPath, ...pathSegments);
};

export { app, db, rtdb, auth, storage };
