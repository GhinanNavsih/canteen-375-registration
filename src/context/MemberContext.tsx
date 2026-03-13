"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Member } from '@/types/member';

interface MemberContextType {
    member: Member | null;       // null for admins (they have no member profile)
    firebaseUser: User | null;
    isAdmin: boolean;            // true when token has admin: true Custom Claim
    loading: boolean;
    logoutMember: () => Promise<void>;
}

const MemberContext = createContext<MemberContextType | undefined>(undefined);

export function MemberProvider({ children }: { children: React.ReactNode }) {
    const [member, setMember] = useState<Member | null>(null);
    const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setFirebaseUser(user);

            if (user) {
                try {
                    // Read the Firebase Auth Custom Claims.
                    // forceRefresh:false uses the cached token (auto-refreshed every hour by Firebase).
                    const tokenResult = await user.getIdTokenResult(false);
                    const adminClaim = tokenResult.claims.admin === true;
                    setIsAdmin(adminClaim);

                    if (adminClaim) {
                        // Admins have NO member profile in Firestore.
                        // They are excluded from competitions, vouchers, and all member logic.
                        setMember(null);
                    } else {
                        // Regular member — fetch their Firestore profile.
                        const memberRef = doc(db, 'Members', user.uid);
                        const memberSnap = await getDoc(memberRef);
                        if (memberSnap.exists()) {
                            setMember({ ...memberSnap.data(), id: memberSnap.id } as Member);
                        } else {
                            console.warn('[MemberContext] No Firestore profile for UID:', user.uid);
                            setMember(null);
                        }
                    }
                } catch (error) {
                    console.error('[MemberContext] Error loading user:', error);
                    setMember(null);
                    setIsAdmin(false);
                }
            } else {
                setMember(null);
                setIsAdmin(false);
            }

            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const logoutMember = async () => {
        await signOut(auth);
        setMember(null);
        setFirebaseUser(null);
        setIsAdmin(false);
        router.push('/login');
    };

    return (
        <MemberContext.Provider value={{ member, firebaseUser, isAdmin, loading, logoutMember }}>
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
