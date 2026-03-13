export interface MenuItem {
  id: string;
  namaMenu: string;
  harga: number;
  category: string;
  imagePath: string;
  isMakanan: boolean;
  isRecommended?: boolean;
  menuDescription?: string;
}

export interface BasketItem {
  menuItem: MenuItem;
  dineInQuantity: number;
  takeAwayQuantity: number;
}

export interface SelfOrder {
  userId: string;
  orderItems: {
    namaPesanan: string;
    dineInQuantity: number;
    takeAwayQuantity: number;
    harga: number;
    viaAssociationRules: boolean;
  }[];
  total: number;
  status: "Unpaid" | "Paid" | "Cancelled";
  shortCode: string;
  timestamp: any;
}
