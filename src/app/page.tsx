"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMember } from "@/hooks/useMember";

export default function Home() {
  const { member, loading } = useMember();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (member) {
        router.push("/dashboard");
      } else {
        router.push("/login");
      }
    }
  }, [member, loading, router]);

  return (
    <div className="loading-screen">
      <div className="loader"></div>
      <style jsx>{`
        .loading-screen {
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #C51720;
        }
        .loader {
          width: 48px;
          height: 48px;
          border: 5px solid #FFF;
          border-bottom-color: transparent;
          border-radius: 50%;
          display: inline-block;
          box-sizing: border-box;
          animation: rotation 1s linear infinite;
        }
        @keyframes rotation {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
