import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCZ1oJuagSPQ_9VWiFONeArwxtUsgLGhCA",
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

export const collection = (instanceOrRef: any, ...pathSegments: string[]): CollectionReference<DocumentData> => {
  if (typeof window !== "undefined" && localStorage.getItem("zTestingMode") === "true") {
    if (instanceOrRef === db && pathSegments.length > 0) {
      const parts = pathSegments[0].split('/');
      if (!parts[0].startsWith('zTesting_')) {
        parts[0] = `zTesting_${parts[0]}`;
        pathSegments[0] = parts.join('/');
      }
    }
  }
  return fsCollection(instanceOrRef, ...pathSegments);
};

export const doc = (instanceOrRef: any, ...pathSegments: string[]): DocumentReference<DocumentData> => {
  if (typeof window !== "undefined" && localStorage.getItem("zTestingMode") === "true") {
    if (instanceOrRef === db && pathSegments.length > 0) {
      const parts = pathSegments[0].split('/');
      if (!parts[0].startsWith('zTesting_')) {
        parts[0] = `zTesting_${parts[0]}`;
        pathSegments[0] = parts.join('/');
      }
    }
  }
  return fsDoc(instanceOrRef, ...pathSegments);
};

export { db, rtdb, auth, storage };
