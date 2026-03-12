"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Member } from '@/types/member';

interface MemberContextType {
    member: Member | null;
    firebaseUser: User | null;
    loading: boolean;
    logoutMember: () => Promise<void>;
}

const MemberContext = createContext<MemberContextType | undefined>(undefined);

export function MemberProvider({ children }: { children: React.ReactNode }) {
    const [member, setMember] = useState<Member | null>(null);
    const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        // Firebase Auth persists the session automatically.
        // No need to read localStorage or do a manual Firestore lookup during login.
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setFirebaseUser(user);

            if (user) {
                try {
                    // Fetch the member profile from Firestore using the Auth UID as the document ID.
                    const memberRef = doc(db, 'Members', user.uid);
                    const memberSnap = await getDoc(memberRef);

                    if (memberSnap.exists()) {
                        setMember({ id: memberSnap.id, ...memberSnap.data() } as Member);
                    } else {
                        // Auth account exists but no Firestore document — edge case (e.g., partially completed registration).
                        console.warn('[MemberContext] Auth user exists but no Firestore profile found for UID:', user.uid);
                        setMember(null);
                    }
                } catch (error) {
                    console.error('[MemberContext] Error fetching member profile:', error);
                    setMember(null);
                }
            } else {
                setMember(null);
            }

            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const logoutMember = async () => {
        await signOut(auth);
        setMember(null);
        setFirebaseUser(null);
        router.push('/leaderboard');
    };

    return (
        <MemberContext.Provider value={{ member, firebaseUser, loading, logoutMember }}>
            {children}
        </MemberContext.Provider>
    );
}

export function useMember() {
    const context = useContext(MemberContext);
    if (context === undefined) {
        throw new Error('useMember must be used within a MemberProvider');
    }
    return context;
}
