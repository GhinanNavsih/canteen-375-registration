"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { MenuItem, BasketItem, SelectedOption } from "@/types/menu";

interface BasketContextType {
  basket: BasketItem[];
  totalItems: number;
  totalPrice: number;
  addToBasket: (item: MenuItem, selectedOptions?: SelectedOption[]) => void;
  removeFromBasket: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, type: "dineIn" | "takeAway", delta: number) => void;
  clearBasket: () => void;
}

const BasketContext = createContext<BasketContextType | undefined>(undefined);

export function BasketProvider({ children }: { children: React.ReactNode }) {
  const [basket, setBasket] = useState<BasketItem[]>([]);

  const addToBasket = useCallback((item: MenuItem, selectedOptions: SelectedOption[] = []) => {
    // Generate a unique ID based on the menu item and its selected options
    const optString = [...selectedOptions]
      .sort((a, b) => a.optionName.localeCompare(b.optionName))
      .map(o => `${o.groupName}:${o.optionName}`)
      .join('|');
    const cartItemId = `${item.id}-${optString}`;

    setBasket((prev) => {
      const existing = prev.find((b) => b.cartItemId === cartItemId);
      if (existing) {
        // If exact configuration already in basket, increment dine-in by default
        return prev.map((b) =>
          b.cartItemId === cartItemId
            ? { ...b, dineInQuantity: b.dineInQuantity + 1 }
            : b
        );
      }
      return [...prev, { 
        cartItemId, 
        menuItem: item, 
        dineInQuantity: 1, 
        takeAwayQuantity: 0, 
        selectedOptions 
      }];
    });
  }, []);

  const removeFromBasket = useCallback((cartItemId: string) => {
    setBasket((prev) => prev.filter((b) => b.cartItemId !== cartItemId));
  }, []);

  const updateQuantity = useCallback(
    (cartItemId: string, type: "dineIn" | "takeAway", delta: number) => {
      setBasket((prev) =>
        prev
          .map((b) => {
            if (b.cartItemId !== cartItemId) return b;
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
    (sum, b) => {
      const optionsPrice = b.selectedOptions.reduce((oSum, opt) => oSum + opt.additionalPrice, 0);
      const itemBasePrice = b.menuItem.harga + optionsPrice;
      const qty = b.dineInQuantity + b.takeAwayQuantity;
      return sum + (itemBasePrice * qty);
    },
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

