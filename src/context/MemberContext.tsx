"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Member } from '@/types/member';

interface MemberContextType {
    member: Member | null;
    loading: boolean;
    loginMember: (memberData: Member) => void;
    logoutMember: () => void;
}

const MemberContext = createContext<MemberContextType | undefined>(undefined);

export function MemberProvider({ children }: { children: React.ReactNode }) {
    const [member, setMember] = useState<Member | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const savedMember = localStorage.getItem('canteen_member_session');
        if (savedMember) {
            try {
                setMember(JSON.parse(savedMember));
            } catch (e) {
                console.error('Failed to parse saved member session', e);
                localStorage.removeItem('canteen_member_session');
            }
        }
        setLoading(false);
    }, []);

    const loginMember = (memberData: Member) => {
        localStorage.setItem('canteen_member_session', JSON.stringify(memberData));
        setMember(memberData);
    };

    const logoutMember = () => {
        localStorage.removeItem('canteen_member_session');
        setMember(null);
        router.push('/login');
    };

    return (
        <MemberContext.Provider value={{ member, loading, loginMember, logoutMember }}>
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
