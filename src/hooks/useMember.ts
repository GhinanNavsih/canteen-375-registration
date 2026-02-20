import { useState, useEffect } from 'react';
import { Member } from '@/types/member';

export function useMember() {
    const [member, setMember] = useState<Member | null>(null);
    const [loading, setLoading] = useState(true);

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
    };

    return { member, loading, loginMember, logoutMember };
}
