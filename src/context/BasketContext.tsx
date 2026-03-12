"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { MenuItem, BasketItem } from "@/types/menu";

interface BasketContextType {
  basket: BasketItem[];
  totalItems: number;
  totalPrice: number;
  addToBasket: (item: MenuItem) => void;
  removeFromBasket: (itemId: string) => void;
  updateQuantity: (itemId: string, type: "dineIn" | "takeAway", delta: number) => void;
  clearBasket: () => void;
}

const BasketContext = createContext<BasketContextType | undefined>(undefined);

export function BasketProvider({ children }: { children: React.ReactNode }) {
  const [basket, setBasket] = useState<BasketItem[]>([]);

  const addToBasket = useCallback((item: MenuItem) => {
    setBasket((prev) => {
      const existing = prev.find((b) => b.menuItem.id === item.id);
      if (existing) {
        // If already in basket, increment dine-in by default
        return prev.map((b) =>
          b.menuItem.id === item.id
            ? { ...b, dineInQuantity: b.dineInQuantity + 1 }
            : b
        );
      }
      return [...prev, { menuItem: item, dineInQuantity: 1, takeAwayQuantity: 0 }];
    });
  }, []);

  const removeFromBasket = useCallback((itemId: string) => {
    setBasket((prev) => prev.filter((b) => b.menuItem.id !== itemId));
  }, []);

  const updateQuantity = useCallback(
    (itemId: string, type: "dineIn" | "takeAway", delta: number) => {
      setBasket((prev) =>
        prev
          .map((b) => {
            if (b.menuItem.id !== itemId) return b;
            const updated =
              type === "dineIn"
                ? { ...b, dineInQuantity: Math.max(0, b.dineInQuantity + delta) }
                : { ...b, takeAwayQuantity: Math.max(0, b.takeAwayQuantity + delta) };
            return updated;
          })
          // Remove item if both quantities reach 0
          .filter((b) => b.dineInQuantity + b.takeAwayQuantity > 0)
      );
    },
    []
  );

  const clearBasket = useCallback(() => setBasket([]), []);

  const totalItems = basket.reduce(
    (sum, b) => sum + b.dineInQuantity + b.takeAwayQuantity,
    0
  );

  const totalPrice = basket.reduce(
    (sum, b) => sum + b.menuItem.harga * (b.dineInQuantity + b.takeAwayQuantity),
    0
  );

  return (
    <BasketContext.Provider
      value={{ basket, totalItems, totalPrice, addToBasket, removeFromBasket, updateQuantity, clearBasket }}
    >
      {children}
    </BasketContext.Provider>
  );
}

export function useBasket() {
  const context = useContext(BasketContext);
  if (!context) throw new Error("useBasket must be used within BasketProvider");
  return context;
}
