export interface MenuItem {
  id: string;
  namaMenu: string;
  harga: number;
  category: string;
  imagePath: string;
  isMakanan: boolean;
  isRecommended?: boolean;
  menuDescription?: string;
  order?: number;
}

export interface OptionItem {
  name: string;
  additionalPrice: number;
}

export interface OptionGroup {
  id: string;
  name: string;
  options: OptionItem[];
  selectionRule: 'required' | 'optional';
  ruleType: 'exactly' | 'at_least' | 'at_most'; // only relevant when required
  ruleCount: number;                              // how many the customer must pick
  linkedItemIds: string[];                        // IDs of MenuItems this group applies to
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
